import { beforeEach, expect, mock, test } from "bun:test";
import { FatalError } from "workflow";
import { CodexRuntimeError } from "@/lib/codex/errors";
import type { WebAgentUIMessage } from "@/app/types";
import type { UIMessageChunk } from "ai";

let runtimeError: Error | null = null;
let stopError: Error | null = null;
let cleared = 0;
let closed = 0;
let persisted: WebAgentUIMessage | null = null;
let chunks: UIMessageChunk[] = [];
mock.module("workflow", () => ({
  FatalError,
  getWorkflowMetadata: () => ({ workflowRunId: "run" }),
  getWritable: () =>
    new WritableStream<UIMessageChunk>({
      write: (chunk) => {
        chunks.push(chunk);
      },
    }),
  sleep: async () => {},
}));
mock.module("./chat-post-finish", () => ({
  claimActiveStream: async () => "claimed",
  clearActiveStream: async () => {
    cleared++;
  },
  closeStream: async () => {
    closed++;
  },
  persistAssistantMessage: async (_id: string, message: WebAgentUIMessage) => {
    persisted = message;
  },
  persistSandboxState: async () => {},
  refreshDiffCache: async () => {},
  refreshLifecycleActivity: async () => {},
}));
mock.module("./chat-sandbox-runtime", () => ({
  resolveChatSandboxRuntime: async () => ({ sandboxState: { type: "vercel" } }),
}));
mock.module("@/lib/codex/runtime", () => ({
  startCodexRun: async () => {
    if (runtimeError) throw runtimeError;
  },
  pollCodexRun: async () => ({ done: true, text: "Workspace task complete." }),
  stopCodexRun: async () => {
    if (stopError) throw stopError;
  },
}));
const { runCodexWorkflow } = await import("./codex");
const options = {
  userId: "owner",
  sessionId: "session",
  chatId: "chat",
  assistantId: "answer",
  messages: [],
};
beforeEach(() => {
  runtimeError = null;
  stopError = null;
  cleared = 0;
  closed = 0;
  persisted = null;
  chunks = [];
});

test("persists and completes a Codex answer and clears the owned stream", async () => {
  await runCodexWorkflow(options);
  expect(persisted).toMatchObject({
    role: "assistant",
    parts: [{ type: "text", text: "Workspace task complete." }],
  });
  expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
  expect(cleared).toBe(1);
  expect(closed).toBe(1);
});
test("unknown server errors are sanitized and still close the stream", async () => {
  runtimeError = new Error("provider echoed private-login-secret");
  await runCodexWorkflow(options);
  expect(JSON.stringify(persisted)).not.toContain("private-login-secret");
  expect(JSON.stringify(persisted)).toContain("Reconnect");
  expect(cleared).toBe(1);
  expect(closed).toBe(1);
});
test("cleanup failure remains visible without leaving the chat stuck streaming", async () => {
  runtimeError = new CodexRuntimeError("Codex usage limit reached.");
  stopError = new Error("private-cleanup-diagnostic");
  await runCodexWorkflow(options);
  expect(JSON.stringify(persisted)).toContain("Codex usage limit reached");
  expect(JSON.stringify(persisted)).toContain(
    "Could not confirm Codex stopped",
  );
  expect(JSON.stringify(persisted)).not.toContain("private-cleanup-diagnostic");
  expect(cleared).toBe(1);
  expect(closed).toBe(1);
});
