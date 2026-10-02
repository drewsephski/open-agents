import { beforeEach, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { ActionProvider } from "@/lib/actions/provider";

mock.module("server-only", () => ({}));
const dialect = new PgDialect();
const rows = new Map<
  string,
  { userId: string; providerId: string; sessionId: string }
>();
const locks = new Map<string, Promise<void>>();
let lockCount = 0;
const query = {
  actionProviderSessions: {
    async findFirst({ where }: { where: SQL }) {
      const { params } = dialect.sqlToQuery(where);
      return rows.get(JSON.stringify(params));
    },
  },
};

mock.module("./client", () => ({
  db: {
    query,
    async transaction(
      callback: (tx: {
        query: typeof query;
        execute: (statement: SQL) => Promise<void>;
        insert: () => {
          values: (row: {
            userId: string;
            providerId: string;
            sessionId: string;
          }) => Promise<void>;
        };
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
                rows.set(JSON.stringify([row.userId, row.providerId]), row);
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

const { ensureActionSession, findActionSession } =
  await import("./action-sessions");
const createSession = mock(async (userId: string) => `trs-${userId}`);
const provider: ActionProvider = {
  id: "composio",
  createSession,
  getConnectionStatus: async () => "not_connected",
  connect: async () => "https://connect.composio.dev",
  getTools: async () => ({}),
};

beforeEach(() => {
  rows.clear();
  locks.clear();
  createSession.mockClear();
  lockCount = 0;
});

test("persists one provider session and reuses it across requests", async () => {
  expect(await ensureActionSession("user-1", provider)).toEqual({
    userId: "user-1",
    sessionId: "trs-user-1",
  });
  await ensureActionSession("user-1", provider);
  expect(await findActionSession("user-1", "composio")).toMatchObject({
    userId: "user-1",
    sessionId: "trs-user-1",
  });
  expect(createSession).toHaveBeenCalledTimes(1);
});

test("serializes simultaneous first connections to avoid duplicate sessions", async () => {
  const sessions = await Promise.all([
    ensureActionSession("user-1", provider),
    ensureActionSession("user-1", provider),
  ]);
  expect(sessions[0]).toEqual(sessions[1]);
  expect(createSession).toHaveBeenCalledTimes(1);
  expect(lockCount).toBe(2);
});

test("never reuses another user's provider session", async () => {
  await ensureActionSession("user-1", provider);
  expect(await findActionSession("user-2", "composio")).toBeUndefined();
  expect(await ensureActionSession("user-2", provider)).toEqual({
    userId: "user-2",
    sessionId: "trs-user-2",
  });
  expect(createSession.mock.calls).toEqual([["user-1"], ["user-2"]]);
});
