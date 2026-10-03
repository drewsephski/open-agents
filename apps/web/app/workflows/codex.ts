import { getWorkflowMetadata, getWritable, sleep, FatalError } from "workflow";
import type { UIMessageChunk } from "ai";
import type { SandboxState } from "@open-agents/sandbox";
import type { WebAgentUIMessage } from "@/app/types";
import {
  claimActiveStream,
  clearActiveStream,
  closeStream,
  persistAssistantMessage,
  persistSandboxState,
  refreshDiffCache,
  refreshLifecycleActivity,
} from "./chat-post-finish";
import { resolveChatSandboxRuntime } from "./chat-sandbox-runtime";
import { CodexRuntimeError, getCodexErrorMessage } from "@/lib/codex/errors";

type Options = {
  messages: WebAgentUIMessage[];
  chatId: string;
  sessionId: string;
  userId: string;
  assistantId: string;
};

async function startRun(
  options: Options,
  runId: string,
  sandboxState: SandboxState,
) {
  "use step";
  const { startCodexRun } = await import("@/lib/codex/runtime");
  try {
    await startCodexRun({ ...options, runId, sandboxState });
  } catch (error) {
    throw new FatalError(getCodexErrorMessage(error));
  }
}

async function pollRun(
  options: Options,
  runId: string,
  sandboxState: SandboxState,
) {
  "use step";
  const { pollCodexRun } = await import("@/lib/codex/runtime");
  try {
    return await pollCodexRun({ ...options, runId, sandboxState });
  } catch (error) {
    throw new FatalError(getCodexErrorMessage(error));
  }
}

async function stopRun(
  sandboxState: SandboxState,
  runId: string,
  userId: string,
) {
  "use step";
  const { stopCodexRun } = await import("@/lib/codex/runtime");
  try {
    await stopCodexRun(sandboxState, runId, userId);
  } catch {
    throw new FatalError(
      "Could not stop Codex. Stop the workspace before starting another task.",
    );
  }
}

async function sendAnswer(
  writable: WritableStream<UIMessageChunk>,
  id: string,
  text: string,
) {
  "use step";
  const writer = writable.getWriter();
  try {
    await writer.write({ type: "text-start", id });
    await writer.write({ type: "text-delta", id, delta: text });
    await writer.write({ type: "text-end", id });
    await writer.write({ type: "finish", finishReason: "stop" });
  } finally {
    writer.releaseLock();
  }
}

export async function runCodexWorkflow(options: Options) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  const claimed = await claimActiveStream(
    options.chatId,
    workflowRunId,
    writable,
    options.assistantId,
  );
  if (claimed !== "claimed") {
    await closeStream(writable);
    return;
  }
  let sandboxState: SandboxState | undefined;
  let text = "";
  try {
    const runtime = await resolveChatSandboxRuntime(options).catch(() => {
      throw new CodexRuntimeError(
        "Could not start the cloud workspace. Check workspace setup, then retry.",
      );
    });
    sandboxState = runtime.sandboxState;
    await startRun(options, workflowRunId, sandboxState);
    for (let attempt = 0; attempt < 180; attempt++) {
      const result = await pollRun(options, workflowRunId, sandboxState);
      if (result.done) {
        text = result.text;
        break;
      }
      await refreshLifecycleActivity(options.sessionId);
      await sleep("3s");
    }
    if (!text)
      throw new CodexRuntimeError(
        "Codex timed out. Review the workspace changes, then send a shorter task.",
      );
  } catch (error) {
    text =
      error instanceof FatalError || error instanceof CodexRuntimeError
        ? error.message
        : "Codex could not finish. Try again.";
  } finally {
    if (sandboxState) {
      try {
        await stopRun(sandboxState, workflowRunId, options.userId);
      } catch {
        text +=
          "\n\nCould not confirm Codex stopped. Stop the workspace before starting another task.";
      }
      await persistSandboxState(options.sessionId, sandboxState);
      await refreshDiffCache(options.sessionId, sandboxState);
    }
  }
  try {
    await persistAssistantMessage(options.chatId, {
      id: options.assistantId,
      role: "assistant",
      parts: [{ type: "text", text }],
      metadata: { selectedModelId: "codex", modelId: "codex" },
    });
    await sendAnswer(writable, options.assistantId, text);
  } finally {
    await clearActiveStream(options.chatId, workflowRunId);
    await closeStream(writable);
  }
}
