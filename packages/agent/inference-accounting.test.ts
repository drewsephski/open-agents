import { describe, expect, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import {
  InferenceAccountingSettlementError,
  withInferenceAccounting,
} from "./inference-accounting";

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

describe("withInferenceAccounting", () => {
  test("reconciles every generated provider call with exact cost metadata", async () => {
    const reconciliations: unknown[] = [];
    const underlying = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "done" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        providerMetadata: {
          openrouter: { usage: { cost: "0.000001000001" } },
        },
        warnings: [],
      },
    });
    const metered = withInferenceAccounting(underlying, {
      reconcile: async (result) => {
        reconciliations.push(result);
      },
    });

    await metered.doGenerate({ prompt: [] });

    expect(reconciliations).toEqual([
      {
        cost: { micros: 2, usd: "0.000001000001" },
        usage,
      },
    ]);
  });

  test("reports missing managed cost before returning a generated result", async () => {
    const underlying = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "done" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    });
    const metered = withInferenceAccounting(underlying, {
      reconcile: async ({ cost }) => {
        if (!cost) throw new Error("managed_inference_cost_missing");
      },
    });

    await expect(metered.doGenerate({ prompt: [] })).rejects.toThrow(
      "managed_inference_cost_missing",
    );
  });

  test("carries a safe retryable settlement payload when reconciliation fails", async () => {
    const underlying = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "done" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        providerMetadata: {
          openrouter: { usage: { cost: "0.125" } },
        },
        warnings: [],
      },
    });
    const metered = withInferenceAccounting(underlying, {
      settlementContext: {
        callId: "call-1",
        userId: "user-1",
        modelId: "openai/gpt-5.6-luna",
        source: "managed",
        agentType: "main",
        occurredAt: "2026-08-15T12:00:00.000Z",
      },
      reconcile: async () => {
        throw new Error("database unavailable");
      },
    });

    let settlementError: unknown;
    try {
      await metered.doGenerate({ prompt: [] });
    } catch (error) {
      settlementError = error;
    }

    expect(settlementError).toBeInstanceOf(InferenceAccountingSettlementError);
    expect(
      (settlementError as InferenceAccountingSettlementError).settlement,
    ).toEqual({
      context: expect.objectContaining({
        callId: "call-1",
        source: "managed",
      }),
      result: {
        cost: { micros: 125_000, usd: "0.125" },
        usage,
      },
    });
  });

  test("reconciles streamed provider calls before exposing the finish part", async () => {
    const events: string[] = [];
    const underlying = {
      specificationVersion: "v3" as const,
      provider: "openrouter",
      modelId: "test/model",
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error("not used");
      },
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "finish" as const,
              finishReason: { unified: "stop" as const, raw: undefined },
              usage,
              providerMetadata: {
                openrouter: { usage: { cost: "0.42" } },
              },
            });
            controller.close();
          },
        }),
      }),
    };
    const metered = withInferenceAccounting(underlying, {
      reconcile: async ({ cost }) => {
        events.push(`reconciled:${cost?.usd}`);
      },
    });

    const result = await metered.doStream({ prompt: [] });
    const reader = result.stream.getReader();
    const part = await reader.read();
    events.push(part.value?.type ?? "missing");

    expect(events).toEqual(["reconciled:0.42", "finish"]);
  });

  test("fails closed when a stream ends without provider cost metadata", async () => {
    const failures: string[] = [];
    const underlying = {
      specificationVersion: "v3" as const,
      provider: "openrouter",
      modelId: "test/model",
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error("not used");
      },
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      }),
    };
    const metered = withInferenceAccounting(underlying, {
      reconcile: async () => undefined,
      fail: async (reason) => {
        failures.push(reason);
      },
    });

    const result = await metered.doStream({ prompt: [] });
    await result.stream.getReader().read();

    expect(failures).toEqual(["stream_truncated"]);
  });

  test("records a cancelled stream as a structured failed-accounting call", async () => {
    const failures: string[] = [];
    const underlying = {
      specificationVersion: "v3" as const,
      provider: "openrouter",
      modelId: "test/model",
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error("not used");
      },
      doStream: async () => ({
        stream: new ReadableStream({
          pull(controller) {
            controller.enqueue({
              type: "text-delta" as const,
              id: "1",
              delta: "partial",
            });
          },
        }),
      }),
    };
    const metered = withInferenceAccounting(underlying, {
      reconcile: async () => undefined,
      fail: async (reason) => {
        failures.push(reason);
      },
    });

    const result = await metered.doStream({ prompt: [] });
    const reader = result.stream.getReader();
    await reader.read();
    await reader.cancel("client disconnected");

    expect(failures).toEqual(["stream_cancelled"]);
  });
});
