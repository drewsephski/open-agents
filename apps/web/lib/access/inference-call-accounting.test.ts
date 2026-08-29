import { describe, expect, mock, test } from "bun:test";
import type { InferenceAccountingResult } from "@open-agents/agent";

mock.module("server-only", () => ({}));

const { createInferenceCallAccountingService } =
  await import("./inference-call-accounting");

const period = {
  start: new Date("2026-08-01T00:00:00.000Z"),
  end: new Date("2026-09-01T00:00:00.000Z"),
};
const result: InferenceAccountingResult = {
  cost: { usd: "0.123456789012", micros: 123_457 },
  usage: {
    inputTokens: { total: 10, noCache: 8, cacheRead: 2, cacheWrite: 0 },
    outputTokens: { total: 4, text: 4, reasoning: 0 },
  },
};

describe("inference call accounting", () => {
  test("admits only one conservative managed call concurrently near the limit", async () => {
    let outstanding = false;
    const store = {
      reserveManaged: async () => {
        if (outstanding) return false;
        outstanding = true;
        return true;
      },
      reconcile: async () => {},
      markMissingCost: async () => {},
    };
    let id = 0;
    const authorize = createInferenceCallAccountingService({
      store,
      createId: () => `call-${++id}`,
    });

    const [first, second] = await Promise.all([
      authorize({
        userId: "user-1",
        modelId: "z-ai/glm-5.3-flash",
        source: "managed",
        period,
      }),
      authorize({
        userId: "user-1",
        modelId: "z-ai/glm-5.3-flash",
        source: "managed",
        period,
      }),
    ]);

    expect(first?.source).toBe("managed");
    expect(second).toBeNull();
  });

  test("reconciles exact cost and source for each subagent provider call", async () => {
    const reconciled: unknown[] = [];
    let id = 0;
    const authorize = createInferenceCallAccountingService({
      store: {
        reserveManaged: async () => true,
        reconcile: async (params) => {
          reconciled.push(params);
        },
        markMissingCost: async () => {},
      },
      createId: () => `subagent-${++id}`,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    for (let call = 0; call < 2; call++) {
      const admission = await authorize({
        userId: "user-1",
        modelId: "openai/gpt-5.6-luna",
        source: "byok",
        agentType: "subagent",
        period: null,
      });
      await admission?.callbacks.reconcile(result);
    }

    expect(reconciled).toHaveLength(2);
    expect(reconciled).toEqual([
      expect.objectContaining({
        callId: "subagent-1",
        source: "byok",
        agentType: "subagent",
        result,
      }),
      expect.objectContaining({
        callId: "subagent-2",
        source: "byok",
        agentType: "subagent",
        result,
      }),
    ]);
  });

  test("fails managed calls closed when provider cost metadata is missing", async () => {
    const missing: string[] = [];
    const authorize = createInferenceCallAccountingService({
      store: {
        reserveManaged: async () => true,
        reconcile: async () => {},
        markMissingCost: async (callId) => {
          missing.push(callId);
        },
      },
      createId: () => "managed-call",
    });
    const admission = await authorize({
      userId: "user-1",
      modelId: "z-ai/glm-5.3-flash",
      source: "managed",
      period,
    });

    await expect(
      admission?.callbacks.reconcile({ ...result, cost: undefined }),
    ).rejects.toThrow("managed_inference_cost_missing");
    expect(missing).toEqual(["managed-call"]);
  });
});
