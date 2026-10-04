import { expect, mock, test } from "bun:test";
import { dynamicTool } from "ai";
import { z } from "zod";
import { runLiveReadProbe } from "./live-read-probe";
import type { ActionProvider } from "./provider";

function fixture() {
  const dispatch = mock(async () => ({
    successful: true,
    data: { body: "private-message", description: "private-issue" },
  }));
  const remove = mock(async (_sessionId: string) => {});
  const create = mock(
    async (_userId: string, _scope: import("./scope").ActionExecutionScope) =>
      "transient-runtime",
  );
  const provider: ActionProvider = {
    id: "composio",
    listAccounts: async () => [{ accountId: "ca-safe", label: "safe" }],
    createSession: create,
    deleteSession: remove,
    createConnectionSession: async () => "",
    connect: async () => "",
    getTools: async () => ({
      GMAIL_FETCH_EMAILS: dynamicTool({
        inputSchema: z.object({
          query: z.string(),
          max_results: z.literal(1),
          include_payload: z.literal(false),
        }),
        execute: dispatch,
      }),
      GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: dynamicTool({
        inputSchema: z.object({ message_id: z.string() }),
        execute: dispatch,
      }),
      GMAIL_SEND_EMAIL: dynamicTool({
        inputSchema: z.object({}),
        execute: async () => {
          throw new Error("Must never dispatch a write");
        },
      }),
    }),
  };
  return { provider, dispatch, remove, create };
}
test("live read probe loads only registered reads, bounds lists, sanitizes evidence, and cleans up", async () => {
  const { provider, dispatch, remove, create } = fixture();
  const result = await runLiveReadProbe({
    provider,
    userId: "user-1",
    toolkit: "gmail",
    accountId: "ca-safe",
    query: "newer_than:1d",
    detailId: "harmless-message",
  });
  expect(result.status).toBe("PASS");
  expect(result.evidence.map((item) => item.action)).toEqual([
    "GMAIL_FETCH_EMAILS",
    "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
  ]);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(dispatch).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0]).toEqual([
    "user-1",
    {
      tools: ["GMAIL_FETCH_EMAILS", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"],
      connectedAccounts: { gmail: "ca-safe" },
    },
  ]);
  expect(remove.mock.calls[0]).toEqual(["transient-runtime"]);
});
test("probe refuses stale identity and cleans up after missing/broadened schemas", async () => {
  const { provider, remove, create } = fixture();
  await expect(
    runLiveReadProbe({
      provider,
      userId: "user",
      toolkit: "gmail",
      accountId: "ca-other",
      query: "safe",
    }),
  ).rejects.toThrow("no longer active");
  expect(create).not.toHaveBeenCalled();
  provider.getTools = async () => ({});
  await expect(
    runLiveReadProbe({
      provider,
      userId: "user",
      toolkit: "gmail",
      accountId: "ca-safe",
      query: "safe",
    }),
  ).rejects.toThrow();
  expect(remove).toHaveBeenCalledTimes(1);
});
