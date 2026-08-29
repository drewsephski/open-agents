import { describe, expect, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import { withInferenceAccounting } from "./inference-accounting";

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
    let failed = false;
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
      fail: async () => {
        failed = true;
      },
    });

    const result = await metered.doStream({ prompt: [] });
    await result.stream.getReader().read();

    expect(failed).toBe(true);
  });
});
