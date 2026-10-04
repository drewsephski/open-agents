import { beforeEach, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { ActionProvider } from "@/lib/actions/provider";
import type { ActionExecutionScope } from "@/lib/actions/scope";

mock.module("server-only", () => ({}));
const dialect = new PgDialect();
interface RuntimeRow {
  userId: string;
  chatId: string;
  providerId: string;
  scopeKey: string;
  scope: ActionExecutionScope;
  sessionId: string;
}
const rows = new Map<string, RuntimeRow>();
const locks = new Map<string, Promise<void>>();
let lockCount = 0;
const query = {
  actionRuntimeSessions: {
    async findFirst({ where }: { where: SQL }) {
      return rows.get(JSON.stringify(dialect.sqlToQuery(where).params));
    },
  },
};
mock.module("./client", () => ({
  db: {
    async transaction(
      callback: (tx: {
        query: typeof query;
        execute: (statement: SQL) => Promise<void>;
        insert: () => { values: (row: RuntimeRow) => Promise<void> };
      }) => Promise<unknown>,
    ) {
      let unlock = () => {};
      try {
        return await callback({
          query,
          async execute(statement) {
            const { sql, params } = dialect.sqlToQuery(statement);
            expect(sql).toContain("pg_advisory_xact_lock");
            lockCount++;
            const key = String(params[0]);
            const previous = locks.get(key) ?? Promise.resolve();
            const current = new Promise<void>((resolve) => {
              unlock = resolve;
            });
            locks.set(
              key,
              previous.then(() => current),
            );
            await previous;
          },
          insert() {
            return {
              async values(row) {
                const key = JSON.stringify([
                  row.userId,
                  row.chatId,
                  row.providerId,
                  row.scopeKey,
                ]);
                expect(rows.has(key)).toBe(false);
                rows.set(key, structuredClone(row));
              },
            };
          },
        });
      } finally {
        unlock();
      }
    },
  },
}));
const { ensureActionRuntimeSession } =
  await import("./action-runtime-sessions");
const createSession = mock(
  async (_userId: string, _scope: ActionExecutionScope) =>
    `trs-${crypto.randomUUID()}`,
);
const provider: ActionProvider = {
  id: "composio",
  createSession,
  createConnectionSession: async () => {
    throw new Error("Runtime must not create connections");
  },
  getConnection: async () => ({ status: "not_connected" }),
  connect: async () => {
    throw new Error("Runtime must not authorize");
  },
  getTools: async () => ({}),
};
const context = { userId: "user-1", chatId: "chat-1" };
const scope: ActionExecutionScope = {
  tools: ["GMAIL_FETCH_EMAILS"],
  connectedAccounts: { gmail: "ca-1" },
};
beforeEach(() => {
  rows.clear();
  locks.clear();
  createSession.mockClear();
  lockCount = 0;
});

test("simultaneous runtime creation dispatches one scoped provider create and reconstructs from serializable IDs", async () => {
  const [first, second] = await Promise.all([
    ensureActionRuntimeSession(context, provider, scope),
    ensureActionRuntimeSession(context, provider, structuredClone(scope)),
  ]);
  expect(first).toEqual(second);
  expect(createSession).toHaveBeenCalledTimes(1);
  expect(createSession.mock.calls[0]).toEqual([context.userId, scope]);
  expect(lockCount).toBe(2);
  expect(
    await ensureActionRuntimeSession(structuredClone(context), provider, scope),
  ).toEqual(first);
  expect(createSession).toHaveBeenCalledTimes(1);
});
test("never inherits a broader scope, another Chat, another user, or a different account", async () => {
  const broad: ActionExecutionScope = {
    ...scope,
    tools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"],
  };
  const first = await ensureActionRuntimeSession(context, provider, broad);
  const narrower = await ensureActionRuntimeSession(context, provider, scope);
  const otherChat = await ensureActionRuntimeSession(
    { ...context, chatId: "chat-2" },
    provider,
    scope,
  );
  const otherUser = await ensureActionRuntimeSession(
    { ...context, userId: "user-2" },
    provider,
    scope,
  );
  const reconnected = await ensureActionRuntimeSession(context, provider, {
    ...scope,
    connectedAccounts: { gmail: "ca-new" },
  });
  expect(
    new Set(
      [first, narrower, otherChat, otherUser, reconnected].map(
        (session) => session.sessionId,
      ),
    ).size,
  ).toBe(5);
  expect(narrower.scope.tools).toEqual(["GMAIL_FETCH_EMAILS"]);
  expect(rows.size).toBe(5);
});
test("rejects corrupt persisted scope before reuse", async () => {
  await ensureActionRuntimeSession(context, provider, scope);
  const row = [...rows.values()][0]!;
  row.scope.tools.push("GMAIL_SEND_EMAIL");
  await expect(
    ensureActionRuntimeSession(context, provider, scope),
  ).rejects.toThrow("does not match");
  expect(createSession).toHaveBeenCalledTimes(1);
});
