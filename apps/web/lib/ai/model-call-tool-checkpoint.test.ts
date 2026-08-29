import { describe, expect, mock, test } from "bun:test";
import { InferenceAccountingSettlementError } from "@open-agents/agent";
import { tool, type InferUIMessageChunk } from "ai";
import { z } from "zod";
import type { WebAgentUIMessage } from "@/app/types";

mock.module("server-only", () => ({}));

const { checkpointToolResults } = await import("./model-call-tool-checkpoint");

describe("checkpointToolResults", () => {
  test("promotes completed mutating tool results before surfacing settlement failure", async () => {
    const settlementError = new InferenceAccountingSettlementError(
      new Error("database unavailable"),
    );
    const chunks: InferUIMessageChunk<WebAgentUIMessage>[] = [
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "write-1",
        toolName: "write",
        input: { path: "src/side-effect.ts", content: "created" },
      },
      {
        type: "tool-output-available",
        toolCallId: "write-1",
        output: { ok: true },
      },
      {
        type: "tool-input-available",
        toolCallId: "bash-1",
        toolName: "bash",
        input: { command: "publish" },
      },
      {
        type: "tool-output-available",
        toolCallId: "bash-1",
        output: { exitCode: 0 },
      },
    ];
    let chunkIndex = 0;
    const stream = new ReadableStream<InferUIMessageChunk<WebAgentUIMessage>>({
      async pull(controller) {
        const chunk = chunks[chunkIndex++];
        if (chunk) {
          controller.enqueue(chunk);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1));
          controller.error(settlementError);
        }
      },
    });
    const record = mock(async (_params: { message: WebAgentUIMessage }) => {});
    const promote = mock(
      async (_params: { workflowRunId: string; stepNumber: number }) => {},
    );
    const checkpointed = checkpointToolResults({
      stream,
      originalMessage: undefined,
      workflowRunId: "workflow-1",
      stepNumber: 1,
      chatId: "chat-1",
      tools: {
        write: tool({
          inputSchema: z.object({ path: z.string(), content: z.string() }),
        }),
        bash: tool({ inputSchema: z.object({ command: z.string() }) }),
      },
      persistence: { record, promote },
    });
    const observerResult = checkpointed.settled.then(
      () => null,
      (error: unknown) => error,
    );

    const reader = checkpointed.output.getReader();
    let outputError: unknown;
    try {
      while (!(await reader.read()).done) {
        // The application branch continues streaming until settlement fails.
      }
    } catch (error) {
      outputError = error;
    }
    expect(outputError).toBe(settlementError);
    expect(await observerResult).toBeNull();

    expect(record).toHaveBeenCalled();
    const lastRecord = record.mock.calls.at(-1)?.[0];
    expect(lastRecord?.message.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-write",
          state: "output-available",
        }),
        expect.objectContaining({
          type: "tool-bash",
          state: "output-available",
        }),
      ]),
    );
    expect(promote).toHaveBeenCalledWith({
      workflowRunId: "workflow-1",
      stepNumber: 1,
    });
  });
});
