import { describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

mock.module("server-only", () => ({}));

const { createSandboxAllowanceStore } = await import("./allowance");

async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE sessions (id text PRIMARY KEY, user_id text NOT NULL);
    CREATE TABLE sandbox_usage_periods (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      tier text NOT NULL,
      period_start timestamp NOT NULL,
      period_end timestamp NOT NULL,
      allowance_milliseconds bigint NOT NULL,
      consumed_milliseconds bigint NOT NULL DEFAULT 0,
      running_sandbox_count integer NOT NULL DEFAULT 0,
      last_metered_at timestamp,
      revision integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (user_id, tier, period_start)
    );
    CREATE TABLE sandbox_metering_leases (
      session_id text PRIMARY KEY,
      user_id text NOT NULL,
      usage_period_id text NOT NULL,
      state text NOT NULL DEFAULT 'starting',
      started_at timestamp NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    );
    INSERT INTO users (id) VALUES ('user-1');
    INSERT INTO sessions (id, user_id) VALUES
      ('session-1', 'user-1'),
      ('session-2', 'user-1'),
      ('session-3', 'user-1');
  `);
  return { client, database: drizzle(client) };
}

describe("production sandbox allowance store", () => {
  test("does not charge provider provisioning time before a sandbox is confirmed running", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const admittedAt = new Date("2026-08-01T00:00:00.000Z");
    const admission = await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "create",
      access: { byokCredentialState: "valid", subscription: null },
      now: admittedAt,
    });
    expect(admission.allowed).toBe(true);

    await store.confirm("session-1", new Date("2026-08-01T00:10:00.000Z"));
    await store.release("session-1", new Date("2026-08-01T00:15:00.000Z"));

    const periods = await client.query<{
      consumed_milliseconds: number;
      running_sandbox_count: number;
    }>(
      "SELECT consumed_milliseconds, running_sandbox_count FROM sandbox_usage_periods",
    );
    expect(periods.rows).toEqual([
      { consumed_milliseconds: 300_000, running_sandbox_count: 0 },
    ]);
    await client.close();
  });

  test("serializes BYOK concurrency and blocks resume at exactly two hours", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const base = {
      userId: "user-1",
      operation: "create" as const,
      access: {
        byokCredentialState: "valid" as const,
        subscription: null,
      },
      now: new Date("2026-08-01T00:00:00.000Z"),
    };

    const concurrent = await Promise.all([
      store.admit({ ...base, sessionId: "session-1" }),
      store.admit({ ...base, sessionId: "session-2" }),
    ]);
    expect(concurrent.filter((result) => result.allowed)).toHaveLength(1);
    const activeSession = concurrent[0].allowed ? "session-1" : "session-2";
    await store.confirm(activeSession, base.now);
    await store.meter(activeSession, new Date("2026-08-01T01:00:00.000Z"));
    await store.release(activeSession, new Date("2026-08-01T01:30:00.000Z"));

    const resumed = await store.admit({
      ...base,
      sessionId: "session-3",
      operation: "resume",
      now: new Date("2026-08-01T01:30:00.000Z"),
    });
    expect(resumed.allowed).toBe(true);
    await store.confirm("session-3", new Date("2026-08-01T01:30:00.000Z"));
    await store.release("session-3", new Date("2026-08-01T02:00:00.000Z"));

    const exhausted = await store.admit({
      ...base,
      sessionId: "session-1",
      operation: "resume",
      now: new Date("2026-08-01T02:00:00.000Z"),
    });
    expect(exhausted).toEqual({
      allowed: false,
      failure: {
        code: "sandbox_allowance_exhausted",
        remediation: ["upgrade_to_pro", "wait_for_reset"],
        resetAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    const periods = await client.query<{
      consumed_milliseconds: number;
      running_sandbox_count: number;
    }>(
      "SELECT consumed_milliseconds, running_sandbox_count FROM sandbox_usage_periods",
    );
    expect(periods.rows).toEqual([
      { consumed_milliseconds: 7_200_000, running_sandbox_count: 0 },
    ]);
    await client.close();
  });

  test("grants Pro two concurrent sandboxes in a fresh paid period", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const periodStart = new Date("2026-08-15T00:00:00.000Z");
    const periodEnd = new Date("2026-09-15T00:00:00.000Z");
    const base = {
      userId: "user-1",
      operation: "create" as const,
      access: {
        byokCredentialState: "valid" as const,
        subscription: {
          status: "active" as const,
          entitlementState: "active" as const,
          financialState: "paid" as const,
          periodStart,
          periodEnd,
          cancelAtPeriodEnd: false,
        },
      },
      now: periodStart,
    };

    const admissions = await Promise.all(
      ["session-1", "session-2", "session-3"].map((sessionId) =>
        store.admit({ ...base, sessionId }),
      ),
    );
    expect(admissions.filter((result) => result.allowed)).toHaveLength(2);
    expect(admissions.find((result) => !result.allowed)).toEqual({
      allowed: false,
      failure: {
        code: "sandbox_concurrency_limit_reached",
        remediation: ["stop_sandbox"],
      },
    });
    await client.close();
  });
});
