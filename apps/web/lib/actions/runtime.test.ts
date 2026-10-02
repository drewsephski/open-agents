import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { dynamicTool } from "ai";
import { z } from "zod";
import type { ActionSession } from "./provider";
import type { ActionExecution } from "./execution";

mock.module("server-only", () => ({}));
const originalKey = process.env.COMPOSIO_API_KEY;
let connected: boolean;
let saved: ActionSession | undefined;
let execution: ActionExecution | undefined;
const dispatch = mock(async (_input: unknown) => ({
  successful: true,
  data: { id: "sent-1" },
}));
const getTools = mock(async (_session: ActionSession) => ({
  GMAIL_SEND_EMAIL: dynamicTool({
    inputSchema: z.object({ body: z.string() }),
    needsApproval: true,
    execute: dispatch,
  }),
}));
const findSession = mock(async (_userId: string, _providerId: string) => saved);
mock.module("@/lib/db/action-sessions", () => ({
  findActionSession: findSession,
}));
mock.module("./composio", () => ({
  createComposioActionProvider: () => ({
    id: "composio",
    getTools,
    getConnectionStatus: async () =>
      connected ? "connected" : "not_connected",
  }),
}));
mock.module("@/lib/db/action-executions", () => ({
  actionExecutionStore: {
    async claim(row: ActionExecution) {
      if (execution) return false;
      execution = row;
      return true;
    },
    async get() {
      return execution;
    },
    async complete(_key: unknown, output: unknown) {
      if (execution) execution = { ...execution, status: "completed", output };
    },
  },
}));
const { getUserActionTools } = await import("./runtime");
beforeEach(() => {
  process.env.COMPOSIO_API_KEY = "test-key";
  connected = true;
  saved = { userId: "user-1", sessionId: "trs-persisted" };
  execution = undefined;
  dispatch.mockClear();
  getTools.mockClear();
  findSession.mockClear();
});
afterAll(() => {
  if (originalKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = originalKey;
});

test("disabled or disconnected integration exposes no tools and never creates sessions", async () => {
  delete process.env.COMPOSIO_API_KEY;
  expect(
    await getUserActionTools({ userId: "user-1", chatId: "chat-1" }),
  ).toEqual({});
  expect(findSession).not.toHaveBeenCalled();
  process.env.COMPOSIO_API_KEY = "test-key";
  saved = undefined;
  expect(
    await getUserActionTools({ userId: "user-1", chatId: "chat-1" }),
  ).toEqual({});
  saved = { userId: "user-1", sessionId: "trs-persisted" };
  connected = false;
  expect(
    await getUserActionTools({ userId: "user-1", chatId: "chat-1" }),
  ).toEqual({});
  expect(getTools).not.toHaveBeenCalled();
});

test("reconstructs from the persisted user's session and guards sends across reconstruction", async () => {
  const context = { userId: "user-1", chatId: "chat-1" };
  const tools = await getUserActionTools(context);
  expect(findSession.mock.calls[0]).toEqual(["user-1", "composio"]);
  expect(getTools.mock.calls[0]).toEqual([saved!]);
  expect(tools.GMAIL_SEND_EMAIL?.needsApproval).toBe(true);
  const execute = tools.GMAIL_SEND_EMAIL?.execute;
  if (!execute) throw new Error("Missing send tool");
  const options = { toolCallId: "send-1", messages: [] };
  await execute({ body: "Hello" }, options);
  const resumed = await getUserActionTools(structuredClone(context));
  await resumed.GMAIL_SEND_EMAIL?.execute?.({ body: "Hello" }, options);
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(execution).toMatchObject({
    ...context,
    toolCallId: "send-1",
    status: "completed",
  });
});
