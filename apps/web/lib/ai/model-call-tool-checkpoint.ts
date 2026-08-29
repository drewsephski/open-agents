import "server-only";

import type { WebAgentUIMessage } from "@/app/types";
import {
  convertToModelMessages,
  type InferUIMessageChunk,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ModelMessage,
  readUIMessageStream,
  type ToolSet,
} from "ai";
import { InferenceAccountingSettlementError } from "@open-agents/agent";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { modelCallToolCheckpoints } from "@/lib/db/schema";

function checkpointId(workflowRunId: string, stepNumber: number): string {
  return `${workflowRunId}:${stepNumber}`;
}

export async function recordObservedToolCheckpoint(params: {
  workflowRunId: string;
  stepNumber: number;
  chatId: string;
  message: WebAgentUIMessage;
  responseMessages: ModelMessage[];
}): Promise<void> {
  const now = new Date();
  await db
    .insert(modelCallToolCheckpoints)
    .values({
      id: checkpointId(params.workflowRunId, params.stepNumber),
      workflowRunId: params.workflowRunId,
      stepNumber: params.stepNumber,
      chatId: params.chatId,
      messageId: params.message.id,
      responseMessage: params.message,
      responseMessages: params.responseMessages,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        modelCallToolCheckpoints.workflowRunId,
        modelCallToolCheckpoints.stepNumber,
      ],
      set: {
        messageId: params.message.id,
        responseMessage: params.message,
        responseMessages: params.responseMessages,
        updatedAt: now,
      },
    });
}

export async function promoteToolCheckpoint(params: {
  workflowRunId: string;
  stepNumber: number;
}): Promise<void> {
  await db
    .update(modelCallToolCheckpoints)
    .set({ state: "replayable", updatedAt: new Date() })
    .where(
      and(
        eq(modelCallToolCheckpoints.workflowRunId, params.workflowRunId),
        eq(modelCallToolCheckpoints.stepNumber, params.stepNumber),
      ),
    );
}

export async function getReplayableToolCheckpoint(params: {
  workflowRunId: string;
  stepNumber: number;
}): Promise<{
  responseMessage: WebAgentUIMessage;
  responseMessages: ModelMessage[];
} | null> {
  const [checkpoint] = await db
    .select({
      responseMessage: modelCallToolCheckpoints.responseMessage,
      responseMessages: modelCallToolCheckpoints.responseMessages,
    })
    .from(modelCallToolCheckpoints)
    .where(
      and(
        eq(modelCallToolCheckpoints.workflowRunId, params.workflowRunId),
        eq(modelCallToolCheckpoints.stepNumber, params.stepNumber),
        eq(modelCallToolCheckpoints.state, "replayable"),
      ),
    )
    .limit(1);
  if (!checkpoint) return null;
  return {
    responseMessage: checkpoint.responseMessage as WebAgentUIMessage,
    responseMessages: checkpoint.responseMessages as ModelMessage[],
  };
}

type CheckpointObserver = {
  output: ReadableStream<InferUIMessageChunk<WebAgentUIMessage>>;
  settled: Promise<void>;
};

export interface ToolCheckpointPersistence {
  record: typeof recordObservedToolCheckpoint;
  promote: typeof promoteToolCheckpoint;
}

function isTerminalToolResultChunk(
  chunk: InferUIMessageChunk<WebAgentUIMessage>,
): boolean {
  return (
    chunk.type === "tool-output-available" ||
    chunk.type === "tool-output-error" ||
    chunk.type === "tool-output-denied"
  );
}

function isSettlementFailure(error: unknown): boolean {
  return (
    error instanceof InferenceAccountingSettlementError ||
    (error instanceof Error &&
      error.name === "InferenceAccountingSettlementError")
  );
}

async function rebuildCompleteToolCheckpoint(params: {
  chunks: InferUIMessageChunk<WebAgentUIMessage>[];
  originalMessage: WebAgentUIMessage | undefined;
  tools: ToolSet;
}): Promise<{
  message: WebAgentUIMessage;
  responseMessages: ModelMessage[];
} | null> {
  const replayStream = new ReadableStream<
    InferUIMessageChunk<WebAgentUIMessage>
  >({
    start(controller) {
      for (const chunk of params.chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  let latestMessage: WebAgentUIMessage | undefined;
  for await (const message of readUIMessageStream<WebAgentUIMessage>({
    message: params.originalMessage,
    stream: replayStream,
    terminateOnError: true,
  })) {
    latestMessage = message;
  }
  if (
    !latestMessage ||
    !lastAssistantMessageIsCompleteWithToolCalls({ messages: [latestMessage] })
  ) {
    return null;
  }
  return {
    message: latestMessage,
    responseMessages: await convertToModelMessages([latestMessage], {
      ignoreIncompleteToolCalls: true,
      tools: params.tools,
    }),
  };
}

function createCheckpointedOutput(params: {
  stream: ReadableStream<InferUIMessageChunk<WebAgentUIMessage>>;
  originalMessage: WebAgentUIMessage | undefined;
  workflowRunId: string;
  stepNumber: number;
  chatId: string;
  tools: ToolSet;
  persistence: ToolCheckpointPersistence;
}): ReadableStream<InferUIMessageChunk<WebAgentUIMessage>> {
  const sourceReader = params.stream.getReader();
  const chunks: InferUIMessageChunk<WebAgentUIMessage>[] = [];
  let hasDurableCheckpoint = false;

  return new ReadableStream({
    async pull(controller) {
      let next: Awaited<ReturnType<typeof sourceReader.read>>;
      try {
        next = await sourceReader.read();
      } catch (error) {
        if (isSettlementFailure(error) && hasDurableCheckpoint) {
          await params.persistence.promote({
            workflowRunId: params.workflowRunId,
            stepNumber: params.stepNumber,
          });
        }
        controller.error(error);
        return;
      }
      if (next.done) {
        controller.close();
        return;
      }

      chunks.push(next.value);
      if (isTerminalToolResultChunk(next.value)) {
        const checkpoint = await rebuildCompleteToolCheckpoint({
          chunks,
          originalMessage: params.originalMessage,
          tools: params.tools,
        });
        if (checkpoint) {
          await params.persistence.record({
            workflowRunId: params.workflowRunId,
            stepNumber: params.stepNumber,
            chatId: params.chatId,
            message: checkpoint.message,
            responseMessages: checkpoint.responseMessages,
          });
          hasDurableCheckpoint = true;
        }
      }
      controller.enqueue(next.value);
    },
    cancel(reason) {
      return sourceReader.cancel(reason);
    },
  });
}

export function checkpointToolResults(params: {
  stream: ReadableStream<InferUIMessageChunk<WebAgentUIMessage>>;
  originalMessage: WebAgentUIMessage | undefined;
  workflowRunId: string;
  stepNumber: number;
  chatId: string;
  tools: ToolSet;
  persistence?: ToolCheckpointPersistence;
}): CheckpointObserver {
  const persistence = params.persistence ?? {
    record: recordObservedToolCheckpoint,
    promote: promoteToolCheckpoint,
  };
  return {
    output: createCheckpointedOutput({
      ...params,
      persistence,
    }),
    settled: Promise.resolve(),
  };
}
