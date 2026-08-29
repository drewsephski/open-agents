import { describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

mock.module("server-only", () => ({}));

const { createSandboxAllowanceStore } = await import("./allowance");

async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE sessions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      lifecycle_state text,
      sandbox_state jsonb
    );
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
      admission_expires_at timestamp,
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
        allowanceState: {
          warning: "exhausted",
          period: {
            start: new Date("2026-08-01T00:00:00.000Z"),
            end: new Date("2026-09-01T00:00:00.000Z"),
          },
          used: 7_200_000,
          limit: 7_200_000,
          remaining: 0,
        },
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

  test("atomically rolls a running BYOK lease into the next UTC month", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const access = {
      byokCredentialState: "valid" as const,
      subscription: null,
    };
    await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "create",
      access,
      now: new Date("2026-08-31T23:50:00.000Z"),
    });
    await store.confirm("session-1", new Date("2026-08-31T23:50:00.000Z"));

    const rolled = await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "resume",
      access,
      now: new Date("2026-09-01T00:10:00.000Z"),
    });
    expect(rolled.allowed).toBe(true);
    await store.release("session-1", new Date("2026-09-01T00:20:00.000Z"));

    const periods = await client.query<{
      period_start: Date;
      consumed_milliseconds: number;
      running_sandbox_count: number;
    }>(
      "SELECT period_start, consumed_milliseconds, running_sandbox_count FROM sandbox_usage_periods ORDER BY period_start",
    );
    expect(periods.rows.map((row) => row.consumed_milliseconds)).toEqual([
      600_000, 600_000,
    ]);
    expect(periods.rows.map((row) => row.running_sandbox_count)).toEqual([
      0, 0,
    ]);
    await client.close();
  });

  test("rolls Pro renewals and gives an upgrade a fresh paid-period allowance", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const byokAccess = {
      byokCredentialState: "valid" as const,
      subscription: null,
    };
    await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "create",
      access: byokAccess,
      now: new Date("2026-08-10T00:00:00.000Z"),
    });
    await store.confirm("session-1", new Date("2026-08-10T00:00:00.000Z"));

    const firstProPeriod = {
      status: "active" as const,
      entitlementState: "active" as const,
      financialState: "paid" as const,
      periodStart: new Date("2026-08-15T00:00:00.000Z"),
      periodEnd: new Date("2026-09-15T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
    };
    const upgraded = await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "resume",
      access: {
        byokCredentialState: "valid",
        subscription: firstProPeriod,
      },
      now: firstProPeriod.periodStart,
    });
    expect(upgraded.allowed && upgraded.state).toMatchObject({
      tier: "pro",
      consumedMilliseconds: 0,
    });

    const secondProPeriod = {
      ...firstProPeriod,
      periodStart: firstProPeriod.periodEnd,
      periodEnd: new Date("2026-10-15T00:00:00.000Z"),
    };
    const renewed = await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "resume",
      access: {
        byokCredentialState: "valid",
        subscription: secondProPeriod,
      },
      now: secondProPeriod.periodStart,
    });
    expect(renewed.allowed && renewed.state).toMatchObject({
      tier: "pro",
      consumedMilliseconds: 0,
    });
    await client.close();
  });

  test("re-admits a downgrade into BYOK and releases an ineligible rollover", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const proAccess = {
      byokCredentialState: "valid" as const,
      subscription: {
        status: "active" as const,
        entitlementState: "active" as const,
        financialState: "paid" as const,
        periodStart: new Date("2026-08-15T00:00:00.000Z"),
        periodEnd: new Date("2026-09-15T00:00:00.000Z"),
        cancelAtPeriodEnd: true,
      },
    };
    await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "create",
      access: proAccess,
      now: proAccess.subscription.periodStart,
    });
    await store.confirm("session-1", proAccess.subscription.periodStart);

    const downgraded = await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "resume",
      access: { byokCredentialState: "valid", subscription: null },
      now: proAccess.subscription.periodEnd,
    });
    expect(downgraded.allowed && downgraded.state.tier).toBe("byok");

    const denied = await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "resume",
      access: { byokCredentialState: "missing", subscription: null },
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(denied.allowed).toBe(false);
    const leases = await client.query("SELECT * FROM sandbox_metering_leases");
    expect(leases.rows).toHaveLength(0);
    await client.close();
  });

  test("recovers timed-out starting leases and keeps metering monotonic", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const access = {
      byokCredentialState: "valid" as const,
      subscription: null,
    };
    const start = new Date("2026-08-01T00:00:00.000Z");
    await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "create",
      access,
      now: start,
    });
    const recovered = await store.admit({
      userId: "user-1",
      sessionId: "session-2",
      operation: "create",
      access,
      now: new Date("2026-08-01T00:16:00.000Z"),
    });
    expect(recovered.allowed).toBe(true);
    await store.confirm("session-2", new Date("2026-08-01T00:16:00.000Z"));
    await store.meter("session-2", new Date("2026-08-01T00:26:00.000Z"));
    await store.meter("session-2", new Date("2026-08-01T00:21:00.000Z"));
    await store.release("session-2", new Date("2026-08-01T00:36:00.000Z"));

    const result = await client.query<{ consumed_milliseconds: number }>(
      "SELECT consumed_milliseconds FROM sandbox_usage_periods",
    );
    expect(result.rows[0]?.consumed_milliseconds).toBe(1_200_000);
    await client.close();
  });

  test("promotes a timed-out starting lease when its provider session is active", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const access = {
      byokCredentialState: "valid" as const,
      subscription: null,
    };
    await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "create",
      access,
      now: new Date("2026-08-01T00:00:00.000Z"),
    });
    await client.query(
      `UPDATE sessions
       SET lifecycle_state = 'active', sandbox_state = '{"type":"vercel","sandboxName":"session-1"}'::jsonb
       WHERE id = 'session-1'`,
    );

    const competingAdmission = await store.admit({
      userId: "user-1",
      sessionId: "session-2",
      operation: "create",
      access,
      now: new Date("2026-08-01T00:16:00.000Z"),
    });
    expect(competingAdmission).toEqual({
      allowed: false,
      failure: {
        code: "sandbox_concurrency_limit_reached",
        remediation: ["stop_sandbox"],
      },
    });
    const leases = await client.query<{ state: string }>(
      "SELECT state FROM sandbox_metering_leases WHERE session_id = 'session-1'",
    );
    expect(leases.rows).toEqual([{ state: "running" }]);
    await client.close();
  });

  test("keeps current-period admission metering monotonic under an older interleaving", async () => {
    const { client, database } = await createTestDatabase();
    const store = createSandboxAllowanceStore(
      database as unknown as Parameters<typeof createSandboxAllowanceStore>[0],
    );
    const access = {
      byokCredentialState: "valid" as const,
      subscription: null,
    };
    await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "create",
      access,
      now: new Date("2026-08-01T00:00:00.000Z"),
    });
    await store.confirm("session-1", new Date("2026-08-01T00:00:00.000Z"));
    await store.meter("session-1", new Date("2026-08-01T00:20:00.000Z"));

    await store.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "resume",
      access,
      now: new Date("2026-08-01T00:10:00.000Z"),
    });
    await store.release("session-1", new Date("2026-08-01T00:30:00.000Z"));

    const period = await client.query<{
      consumed_milliseconds: number;
      last_metered_at: Date;
    }>(
      "SELECT consumed_milliseconds, last_metered_at FROM sandbox_usage_periods",
    );
    expect(period.rows).toEqual([
      {
        consumed_milliseconds: 1_800_000,
        last_metered_at: new Date("2026-08-01T00:30:00.000Z"),
      },
    ]);
    await client.close();
  });
});
