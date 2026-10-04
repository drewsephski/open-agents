import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  convertToModelMessages,
  generateText,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { ACTION_IDS, ACTION_REGISTRY } from "./registry";
import type { ActionExecutionScope } from "./scope";
const gmailTools = ACTION_IDS.filter(
  (name) => ACTION_REGISTRY[name].toolkit === "gmail",
);
const scope: ActionExecutionScope = {
  tools: gmailTools,
  connectedAccounts: { gmail: "ca-user-1" },
};

mock.module("server-only", () => ({}));
const { createComposioActionProvider } = await import("./composio");
const originalFetch = globalThis.fetch;
let requests: Array<{ url: string; body: Record<string, unknown> }>;
let connected: boolean;
let executeStatus: number;

const session = {
  session_id: "trs-user-1",
  mcp: { url: "https://backend.composio.dev/mcp" },
  config: {
    preload: { tools: gmailTools },
    workbench: { enable: false },
  },
};

beforeEach(() => {
  requests = [];
  connected = false;
  executeStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const body: Record<string, unknown> =
      typeof init?.body === "string" ? JSON.parse(init.body) : {};
    requests.push({ url, body });
    if (url.endsWith("/execute")) {
      return Response.json(
        {
          data: { id: "gmail-result-1" },
          error: executeStatus === 200 ? null : "failed",
          log_id: "log-1",
        },
        { status: executeStatus },
      );
    }
    if (url.endsWith("/link")) {
      return Response.json({
        connected_account_id: "ca-user-1",
        redirect_url: "https://connect.composio.dev/oauth/gmail",
      });
    }
    if (url.includes("/toolkits")) {
      return Response.json({
        items: [
          {
            slug: "gmail",
            name: "Gmail",
            is_no_auth: false,
            connected_account: {
              id: "ca-user-1",
              status: connected ? "ACTIVE" : "INITIATED",
              auth_config: {
                id: "ac-gmail",
                auth_scheme: "OAUTH2",
                is_composio_managed: true,
              },
            },
          },
        ],
        total_pages: 1,
      });
    }
    if (url.includes("/tools")) {
      return Response.json({
        items: [
          ...ACTION_IDS,
          "LINEAR_CREATE_LINEAR_ISSUE",
          "COMPOSIO_MULTI_EXECUTE_TOOL",
          "GMAIL_DELETE_MESSAGE",
        ].map((slug) => ({
          slug,
          name: slug,
          description: slug,
          input_parameters: {
            type: "object",
            properties: {
              body: { type: "string" },
              recipient_email: { type: "string" },
            },
            required: [],
          },
          output_parameters: { type: "object" },
        })),
        next_cursor: null,
      });
    }
    if (url.includes("/tool_router/session")) return Response.json(session);
    throw new Error(`Unexpected SDK request: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function toolModel(toolName: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [
        {
          type: "tool-call",
          toolCallId: `call-${toolName}`,
          toolName,
          input: JSON.stringify({
            body: "Thanks for your email",
            recipient_email: "reader@example.com",
          }),
        },
      ],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

const completionModel = () =>
  new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text: "Done" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });

async function requestAction(tools: ToolSet, toolName: string) {
  return generateText({
    model: toolModel(toolName),
    tools,
    prompt: "Respond to my email",
  });
}

function approvalRequest(messages: ModelMessage[]) {
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string")
      continue;
    for (const part of message.content) {
      if (part.type === "tool-approval-request") return part;
    }
  }
  throw new Error("Missing approval request");
}

describe("Composio Gmail vertical with real SDKs and stubbed HTTP", () => {
  test("creates a restricted runtime, connects Gmail, and resumes it", async () => {
    const provider = createComposioActionProvider("test-server-key");
    expect(await provider.createSession("launchstack-user-1", scope)).toBe(
      "trs-user-1",
    );
    const create = requests.find(
      (request) => request.body.user_id === "launchstack-user-1",
    )!;
    expect(create.body).toMatchObject({
      toolkits: { enable: ["gmail"] },
      connected_accounts: { gmail: ["ca-user-1"] },
      preload: { tools: [...gmailTools].sort() },
      tools: { gmail: { enable: [...gmailTools].sort() } },
      manage_connections: { enable: false },
      workbench: { enable: false },
      search: { enable: false },
      execute: { enable_multi_execute: false },
    });
    const reference = {
      userId: "launchstack-user-1",
      sessionId: "trs-user-1",
      scope,
    };
    expect(await provider.getConnection(reference, "gmail")).toEqual({
      status: "not_connected",
    });
    expect(
      await provider.connect(
        reference,
        "gmail",
        "https://launchstack.sh/settings/connections",
      ),
    ).toBe("https://connect.composio.dev/oauth/gmail");
    expect(
      requests.find((request) => request.url.endsWith("/link"))?.body,
    ).toEqual({
      toolkit: "gmail",
      callback_url: "https://launchstack.sh/settings/connections",
    });
    connected = true; // OAuth provider completion; callback query parameters are not trusted.
    expect(await provider.getConnection(reference, "gmail")).toEqual({
      status: "connected",
      accountId: "ca-user-1",
    });
    expect(requests.filter((request) => request.body.user_id).length).toBe(1);
  });

  test("fetch → draft approval → send approval uses AI SDK approval responses", async () => {
    const provider = createComposioActionProvider("test-server-key");
    const tools = await provider.getTools({
      userId: "user-1",
      sessionId: "trs-user-1",
      scope,
    });
    expect(Object.keys(tools)).toEqual(gmailTools);
    expect(tools.GMAIL_SEND_EMAIL?.needsApproval).toBe(true);
    const read = await requestAction(tools, "GMAIL_FETCH_EMAILS");
    expect(read.toolResults.length).toBe(1);
    expect(
      requests.filter((request) => request.url.endsWith("/execute")).length,
    ).toBe(1);

    for (const name of ["GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_SEND_EMAIL"]) {
      const before = requests.filter((request) =>
        request.url.endsWith("/execute"),
      ).length;
      const result = await requestAction(tools, name);
      expect(
        requests.filter((request) => request.url.endsWith("/execute")).length,
      ).toBe(before);
      const approval = approvalRequest(result.response.messages);
      // Rebuild provider and tools as the next durable step would, using IDs only.
      const resumedTools = await createComposioActionProvider(
        "test-server-key",
      ).getTools({ userId: "user-1", sessionId: "trs-user-1", scope });
      const messages = await convertToModelMessages(
        [
          {
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: name,
                toolCallId: approval.toolCallId,
                state: "approval-responded",
                input: {
                  body: "Thanks for your email",
                  recipient_email: "reader@example.com",
                },
                approval: { id: approval.approvalId, approved: true },
              },
            ],
          },
        ],
        { tools: resumedTools },
      );
      await generateText({
        model: completionModel(),
        tools: resumedTools,
        messages,
      });
      expect(
        requests.filter((request) => request.url.endsWith("/execute")).length,
      ).toBe(before + 1);
      expect(
        requests.findLast((request) => request.url.endsWith("/execute"))?.body
          .tool_slug,
      ).toBe(name);
    }
  });

  test("denying a send never executes it", async () => {
    const tools = await createComposioActionProvider(
      "test-server-key",
    ).getTools({ userId: "user-1", sessionId: "trs-user-1", scope });
    const result = await requestAction(tools, "GMAIL_SEND_EMAIL");
    const approval = approvalRequest(result.response.messages);
    await generateText({
      model: completionModel(),
      tools,
      messages: [
        ...result.response.messages,
        {
          role: "tool",
          content: [
            {
              type: "tool-approval-response",
              approvalId: approval.approvalId,
              approved: false,
            },
          ],
        },
      ],
    });
    expect(requests.some((request) => request.url.endsWith("/execute"))).toBe(
      false,
    );
  });

  test("the SDK transport does not retry a failed send", async () => {
    executeStatus = 500;
    const tools = await createComposioActionProvider(
      "test-server-key",
    ).getTools({ userId: "user-1", sessionId: "trs-user-1", scope });
    const send = tools.GMAIL_SEND_EMAIL?.execute;
    if (!send) throw new Error("Missing send tool");
    await expect(
      Promise.resolve(
        send({ body: "Hello" }, { toolCallId: "send-1", messages: [] }),
      ),
    ).rejects.toThrow();
    expect(
      requests.filter((request) => request.url.endsWith("/execute")).length,
    ).toBe(1);
  });
});

test("read-only and Linear sessions configure exact provider scopes before schemas load", async () => {
  const provider = createComposioActionProvider("test-server-key");
  for (const scoped of [
    {
      tools: ["GMAIL_FETCH_EMAILS", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"],
      connectedAccounts: { gmail: "ca-user-1" },
    },
    {
      tools: ["LINEAR_SEARCH_ISSUES", "LINEAR_GET_LINEAR_ISSUE"],
      connectedAccounts: { linear: "ca-linear" },
    },
    {
      tools: ["GMAIL_FETCH_EMAILS", "LINEAR_SEARCH_ISSUES"],
      connectedAccounts: { gmail: "ca-user-1", linear: "ca-linear" },
    },
  ] satisfies ActionExecutionScope[]) {
    await provider.createSession("scoped-user", scoped);
    const create = requests.findLast(
      (request) => request.body.user_id === "scoped-user",
    )!;
    expect(create.body.preload).toEqual({ tools: [...scoped.tools].sort() });
    expect(create.body.toolkits).toEqual({
      enable: [
        ...new Set(
          [...scoped.tools].sort().map((name) => ACTION_REGISTRY[name].toolkit),
        ),
      ],
    });
    expect(create.body.manage_connections).toEqual({ enable: false });
    expect(create.body.search).toEqual({ enable: false });
    expect(create.body.execute).toEqual({ enable_multi_execute: false });
    const tools = await provider.getTools({
      userId: "scoped-user",
      sessionId: "trs-user-1",
      scope: scoped,
    });
    expect(Object.keys(tools).sort()).toEqual([...scoped.tools].sort());
    expect(tools.GMAIL_SEND_EMAIL).toBeUndefined();
    expect(tools.LINEAR_CREATE_LINEAR_ISSUE).toBeUndefined();
    expect(
      Object.values(tools).every((tool) => tool.needsApproval === false),
    ).toBe(true);
    const resumed = await createComposioActionProvider(
      "test-server-key",
    ).getTools(
      structuredClone({
        userId: "scoped-user",
        sessionId: "trs-user-1",
        scope: scoped,
      }),
    );
    expect(Object.keys(resumed)).toEqual(Object.keys(tools));
    if (tools.LINEAR_SEARCH_ISSUES) {
      expect(
        (await requestAction(tools, "LINEAR_SEARCH_ISSUES")).toolResults,
      ).toHaveLength(1);
      expect(
        requests.findLast((request) => request.url.endsWith("/execute"))?.body
          .tool_slug,
      ).toBe("LINEAR_SEARCH_ISSUES");
    }
  }
});
test("connection management creates no executable tools and never dispatches an action", async () => {
  const provider = createComposioActionProvider("test-server-key");
  await provider.createConnectionSession("connection-user", "linear");
  const create = requests.find(
    (request) => request.body.user_id === "connection-user",
  )!;
  expect(create.body).toMatchObject({
    toolkits: { enable: ["linear"] },
    tools: { linear: { enable: [] } },
    preload: { tools: [] },
  });
  expect(requests.some((request) => request.url.endsWith("/execute"))).toBe(
    false,
  );
});
