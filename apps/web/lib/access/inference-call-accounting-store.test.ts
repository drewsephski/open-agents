import { describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

mock.module("server-only", () => ({}));

const { createInferenceCallAccountingStore } =
  await import("./inference-call-accounting");

async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE managed_inference_keys (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      lifecycle_state text NOT NULL,
      period_start timestamp NOT NULL,
      period_end timestamp NOT NULL
    );
    CREATE TABLE usage_events (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      source text NOT NULL DEFAULT 'web',
      agent_type text NOT NULL DEFAULT 'main',
      provider text,
      model_id text,
      credential_source text,
      inference_cost_usd numeric(18, 12),
      accounting_status text NOT NULL DEFAULT 'accounted',
      accounting_failure_reason text,
      input_tokens integer NOT NULL DEFAULT 0,
      cached_input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      tool_call_count integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE inference_call_reservations (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      model_id text NOT NULL,
      period_start timestamp NOT NULL,
      period_end timestamp NOT NULL,
      reserved_micros bigint NOT NULL,
      state text NOT NULL DEFAULT 'pending',
      actual_cost_usd numeric(18, 12),
      actual_cost_micros bigint,
      expires_at timestamp NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      completed_at timestamp
    );
  `);
  await client.query("INSERT INTO users (id) VALUES ('user-1')");
  return { client, database: drizzle(client) };
}

const firstPeriod = {
  start: new Date("2026-08-01T00:00:00.000Z"),
  end: new Date("2026-09-01T00:00:00.000Z"),
};

describe("production inference accounting store", () => {
  test("attributes a call that finishes after reset to its admission period", async () => {
    const { client, database } = await createTestDatabase();
    await client.query(
      `INSERT INTO managed_inference_keys
        (id, user_id, lifecycle_state, period_start, period_end)
       VALUES ('key-boundary', 'user-1', 'active', $1, $2)`,
      [firstPeriod.start, firstPeriod.end],
    );
    const store = createInferenceCallAccountingStore(
      database as unknown as Parameters<
        typeof createInferenceCallAccountingStore
      >[0],
    );
    const occurredAt = new Date("2026-08-31T23:59:59.000Z");
    const completedAt = new Date("2026-09-01T00:00:01.000Z");
    expect(
      await store.reserveManaged({
        callId: "boundary-call",
        userId: "user-1",
        modelId: "z-ai/glm-5.3-flash",
        period: firstPeriod,
        now: occurredAt,
      }),
    ).toBe(true);
    await store.reconcile({
      callId: "boundary-call",
      userId: "user-1",
      modelId: "z-ai/glm-5.3-flash",
      source: "managed",
      agentType: "main",
      occurredAt,
      now: completedAt,
      result: {
        cost: { usd: "10", micros: 10_000_000 },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      },
    });

    expect(
      await store.reserveManaged({
        callId: "old-period-call",
        userId: "user-1",
        modelId: "z-ai/glm-5.3-flash",
        period: firstPeriod,
        now: completedAt,
      }),
    ).toBe(false);
    await client.close();
  });

  test("serializes admission, reconciles exact cost, and resets by paid period", async () => {
    const { client, database } = await createTestDatabase();
    await client.query(
      `INSERT INTO managed_inference_keys
        (id, user_id, lifecycle_state, period_start, period_end)
       VALUES ('key-1', 'user-1', 'active', $1, $2)`,
      [firstPeriod.start, firstPeriod.end],
    );
    const store = createInferenceCallAccountingStore(
      database as unknown as Parameters<
        typeof createInferenceCallAccountingStore
      >[0],
    );
    const request = {
      userId: "user-1",
      modelId: "z-ai/glm-5.3-flash",
      period: firstPeriod,
      now: new Date("2026-08-15T12:00:00.000Z"),
    };

    const admissions = await Promise.all([
      store.reserveManaged({ ...request, callId: "call-1" }),
      store.reserveManaged({ ...request, callId: "call-2" }),
    ]);
    expect(admissions.filter(Boolean)).toHaveLength(1);
    const admittedCallId = admissions[0] ? "call-1" : "call-2";
    await store.reconcile({
      callId: admittedCallId,
      userId: request.userId,
      modelId: request.modelId,
      source: "managed",
      agentType: "subagent",
      occurredAt: request.now,
      now: request.now,
      result: {
        cost: { usd: "0.123456789012", micros: 123_457 },
        usage: {
          inputTokens: { total: 10, noCache: 8, cacheRead: 2, cacheWrite: 0 },
          outputTokens: { total: 4, text: 4, reasoning: 0 },
        },
      },
    });
    const usage = await client.query<{
      credential_source: string;
      inference_cost_usd: string;
      agent_type: string;
    }>(
      "SELECT credential_source, inference_cost_usd, agent_type FROM usage_events",
    );
    expect(usage.rows).toEqual([
      {
        credential_source: "managed",
        inference_cost_usd: "0.123456789012",
        agent_type: "subagent",
      },
    ]);
    expect(await store.reserveManaged({ ...request, callId: "call-3" })).toBe(
      true,
    );
    await store.recordFailedAccounting({
      callId: "call-3",
      userId: request.userId,
      modelId: request.modelId,
      source: "managed",
      agentType: "main",
      reason: "missing_cost",
      occurredAt: request.now,
      now: request.now,
    });
    expect(await store.reserveManaged({ ...request, callId: "call-4" })).toBe(
      false,
    );

    const nextPeriod = {
      start: firstPeriod.end,
      end: new Date("2026-10-01T00:00:00.000Z"),
    };
    await client.query(
      `INSERT INTO managed_inference_keys
        (id, user_id, lifecycle_state, period_start, period_end)
       VALUES ('key-2', 'user-1', 'active', $1, $2)`,
      [nextPeriod.start, nextPeriod.end],
    );
    expect(
      await store.reserveManaged({
        ...request,
        callId: "call-next-period",
        period: nextPeriod,
        now: nextPeriod.start,
      }),
    ).toBe(true);
    await client.close();
  });

  test("recovers a stale pending reservation without unlocking a late settlement", async () => {
    const { client, database } = await createTestDatabase();
    await client.query(
      `INSERT INTO managed_inference_keys
        (id, user_id, lifecycle_state, period_start, period_end)
       VALUES ('key-stale', 'user-1', 'active', $1, $2)`,
      [firstPeriod.start, firstPeriod.end],
    );
    const store = createInferenceCallAccountingStore(
      database as unknown as Parameters<
        typeof createInferenceCallAccountingStore
      >[0],
    );
    const admittedAt = new Date("2026-08-15T00:00:00.000Z");
    expect(
      await store.reserveManaged({
        callId: "stale-call",
        userId: "user-1",
        modelId: "z-ai/glm-5.3-flash",
        period: firstPeriod,
        now: admittedAt,
      }),
    ).toBe(true);
    expect(
      await store.reserveManaged({
        callId: "replacement-call",
        userId: "user-1",
        modelId: "z-ai/glm-5.3-flash",
        period: firstPeriod,
        now: new Date("2026-08-15T01:00:00.000Z"),
      }),
    ).toBe(true);

    await store.reconcile({
      callId: "stale-call",
      userId: "user-1",
      modelId: "z-ai/glm-5.3-flash",
      source: "managed",
      agentType: "main",
      occurredAt: admittedAt,
      now: new Date("2026-08-15T01:00:01.000Z"),
      result: {
        cost: { usd: "0.5", micros: 500_000 },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      },
    });
    const reservations = await client.query<{ id: string; state: string }>(
      "SELECT id, state FROM inference_call_reservations ORDER BY id",
    );
    expect(reservations.rows).toEqual([
      { id: "replacement-call", state: "pending" },
      { id: "stale-call", state: "reconciled" },
    ]);
    await client.close();
  });
});
