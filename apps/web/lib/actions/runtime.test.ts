import { buildDefaultStack } from "@/lib/stacks/default-stack";
import { toUserPreferencesData } from "@/lib/db/user-preferences";
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { dynamicTool } from "ai";
import { z } from "zod";
import type { ActionSession, ActionExecutionSession } from "./provider";
import type { ActionExecution } from "./execution";

mock.module("server-only", () => ({}));
const originalKey = process.env.COMPOSIO_API_KEY;
let connected: boolean;
let saved: ActionSession | undefined;
let execution: ActionExecution | undefined;
let codingSession: { userId: string; stackSnapshot?: unknown };
let providerMutationApproval: boolean;
mock.module("@/lib/db/sessions", () => ({
  getChatById: async () => ({ sessionId: "session-1" }),
  getSessionById: async () => codingSession,
}));
const dispatch = mock(async (_input: unknown) => ({
  successful: true,
  data: { id: "sent-1" },
}));
const getTools = mock(async (_session: ActionExecutionSession) => ({
  LINEAR_SEARCH_ISSUES: dynamicTool({
    inputSchema: z.object({}),
    execute: async () => ({ issues: [] }),
  }),
  LINEAR_GET_LINEAR_ISSUE: dynamicTool({
    inputSchema: z.object({}),
    execute: async () => ({ id: "issue-1" }),
  }),
  LINEAR_CREATE_LINEAR_ISSUE: dynamicTool({
    inputSchema: z.object({}),
    execute: dispatch,
  }),
  GMAIL_FETCH_EMAILS: dynamicTool({
    inputSchema: z.object({ query: z.string() }),
    execute: async () => ({ emails: [] }),
  }),
  COMPOSIO_EXECUTE_TOOL: dynamicTool({
    inputSchema: z.object({}),
    execute: dispatch,
  }),
  GMAIL_SEND_EMAIL: dynamicTool({
    inputSchema: z.object({ body: z.string() }),
    needsApproval: providerMutationApproval,
    execute: dispatch,
  }),
}));
const findSession = mock(
  async (_userId: string, _providerId: string, _toolkit: string) => saved,
);
const ensureRuntime = mock(
  async (
    context: { userId: string; chatId: string },
    _provider: unknown,
    scope: ActionExecutionSession["scope"],
  ) => ({
    userId: context.userId,
    sessionId: `runtime-${context.chatId}`,
    scope,
  }),
);
mock.module("@/lib/db/action-runtime-sessions", () => ({
  ensureActionRuntimeSession: ensureRuntime,
}));
mock.module("@/lib/db/action-sessions", () => ({
  findActionSession: findSession,
}));
mock.module("./composio", () => ({
  createComposioActionProvider: () => ({
    id: "composio",
    getTools,
    getConnection: async () =>
      connected
        ? { status: "connected", accountId: "ca-user-1" }
        : { status: "not_connected" },
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
  codingSession = { userId: "user-1" };
  providerMutationApproval = true;
  dispatch.mockClear();
  getTools.mockClear();
  findSession.mockClear();
  ensureRuntime.mockClear();
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
  expect(findSession.mock.calls[0]).toEqual(["user-1", "composio", "gmail"]);
  expect(getTools.mock.calls[0]?.[0].sessionId).toBe("runtime-chat-1");
  expect(getTools.mock.calls[0]?.[0].sessionId).not.toBe(saved!.sessionId);
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

test("Stack restrictions survive tool reconstruction and reject forged ownership", async () => {
  const configuration = buildDefaultStack(
    toUserPreferencesData(),
    "launchstack_native",
  );
  configuration.actions.capabilities = [{ toolkit: "gmail", access: "read" }];
  codingSession.stackSnapshot = { name: "Reader", version: 1, configuration };
  const context = { userId: "user-1", chatId: "chat-1" };
  expect(Object.keys(await getUserActionTools(context))).toEqual([
    "GMAIL_FETCH_EMAILS",
  ]);
  expect(
    Object.keys(await getUserActionTools(structuredClone(context))),
  ).toEqual(["GMAIL_FETCH_EMAILS"]);
  expect(dispatch).not.toHaveBeenCalled();
  configuration.actions.capabilities = [];
  codingSession.stackSnapshot = { name: "Offline", version: 1, configuration };
  findSession.mockClear();
  expect(await getUserActionTools(context)).toEqual({});
  expect(findSession).not.toHaveBeenCalled();
  codingSession.userId = "other-user";
  await expect(getUserActionTools(context)).rejects.toThrow(
    "Unauthorized action context",
  );
});

test("the server registry excludes meta tools and forces mutation approval even if the provider does not", async () => {
  providerMutationApproval = false;
  const tools = await getUserActionTools({
    userId: "user-1",
    chatId: "chat-1",
  });
  expect(tools.COMPOSIO_EXECUTE_TOOL).toBeUndefined();
  expect(tools.GMAIL_SEND_EMAIL?.needsApproval).toBe(true);
});

test("Linear-only scope never inherits Gmail; both toolkits survive durable reconstruction", async () => {
  const configuration = buildDefaultStack(
    toUserPreferencesData(),
    "launchstack_native",
  );
  configuration.actions.capabilities = [{ toolkit: "linear", access: "read" }];
  codingSession.stackSnapshot = {
    name: "Linear reader",
    version: 1,
    configuration,
  };
  const context = { userId: "user-1", chatId: "linear-chat" };
  expect(Object.keys(await getUserActionTools(context)).sort()).toEqual([
    "LINEAR_GET_LINEAR_ISSUE",
    "LINEAR_SEARCH_ISSUES",
  ]);
  const firstScope = getTools.mock.calls[0]?.[0].scope;
  await getUserActionTools(structuredClone(context));
  expect(getTools.mock.calls[1]?.[0].scope).toEqual(firstScope);
  expect(firstScope).toEqual({
    tools: ["LINEAR_GET_LINEAR_ISSUE", "LINEAR_SEARCH_ISSUES"],
    connectedAccounts: { linear: "ca-user-1" },
  });
  expect(dispatch).not.toHaveBeenCalled();
  configuration.actions.capabilities.push({ toolkit: "gmail", access: "read" });
  codingSession.stackSnapshot = {
    name: "Both readers",
    version: 1,
    configuration,
  };
  const tools = await getUserActionTools({ ...context, chatId: "both-chat" });
  expect(tools.GMAIL_FETCH_EMAILS).toBeDefined();
  expect(tools.LINEAR_SEARCH_ISSUES).toBeDefined();
  expect(tools.GMAIL_SEND_EMAIL).toBeUndefined();
});

test("missing required connection fails clearly before runtime creation or dispatch", async () => {
  const configuration = buildDefaultStack(
    toUserPreferencesData(),
    "launchstack_native",
  );
  configuration.actions.capabilities = [{ toolkit: "linear", access: "read" }];
  codingSession.stackSnapshot = {
    name: "Linear reader",
    version: 1,
    configuration,
  };
  connected = false;
  await expect(
    getUserActionTools({ userId: "user-1", chatId: "chat-1" }),
  ).rejects.toThrow("Linear is required by this Stack");
  expect(ensureRuntime).not.toHaveBeenCalled();
  expect(getTools).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

test("malformed snapshots fail closed before provider loading", async () => {
  codingSession.stackSnapshot = {
    configuration: { actions: { capabilities: [{ toolkit: "slack" }] } },
  };
  await expect(
    getUserActionTools({ userId: "user-1", chatId: "chat-1" }),
  ).rejects.toThrow();
  expect(ensureRuntime).not.toHaveBeenCalled();
  expect(getTools).not.toHaveBeenCalled();
});
