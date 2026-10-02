import { describe, expect, test } from "bun:test";
import {
  extractModelCost,
  extractModelCostUsd,
  extractNormalizedUsage,
} from "./usage-metadata";

describe("extractNormalizedUsage", () => {
  test("reads OpenRouter usage and cost metadata", () => {
    expect(
      extractNormalizedUsage({
        openrouter: {
          usage: {
            promptTokens: 120,
            completionTokens: 40,
            promptTokensDetails: { cachedTokens: 16 },
            completionTokensDetails: { reasoningTokens: 8 },
            cost: 0.0042,
          },
        },
      }),
    ).toEqual({
      inputTokens: 120,
      outputTokens: 40,
      reasoningTokens: 8,
      cachedTokens: 16,
      cost: 0.0042,
    });
  });

  test("parses string cost values", () => {
    expect(
      extractModelCost({
        openrouter: {
          usage: {
            cost: "0.0025",
          },
        },
      }),
    ).toBe(0.0025);
    expect(
      extractModelCostUsd({
        openrouter: { usage: { cost: "0.002500000001" } },
      }),
    ).toEqual({ micros: 2501, usd: "0.002500000001" });
  });

  test("normalizes exact provider dollars without floating point drift", () => {
    expect(
      extractModelCostUsd({
        openrouter: { usage: { cost: "9.999999999999" } },
      }),
    ).toEqual({ micros: 10_000_000, usd: "9.999999999999" });
    expect(
      extractModelCostUsd({
        openrouter: { usage: { cost: "0.000000000001" } },
      }),
    ).toEqual({ micros: 1, usd: "0.000000000001" });
  });

  test("rejects malformed, negative, and over-precision costs", () => {
    for (const cost of ["", "1e-3", "-0.1", "0.0000000000001", "NaN"]) {
      expect(
        extractModelCostUsd({ openrouter: { usage: { cost } } }),
      ).toBeUndefined();
    }
  });

  test("ignores Vercel Gateway cost metadata", () => {
    expect(
      extractNormalizedUsage({
        gateway: {
          cost: "1.23",
        },
      }),
    ).toEqual({});
    expect(
      extractModelCost({
        gateway: {
          cost: "1.23",
        },
      }),
    ).toBeUndefined();
  });

  test("returns empty usage when metadata is missing", () => {
    expect(extractNormalizedUsage(undefined)).toEqual({});
    expect(extractModelCost(undefined)).toBeUndefined();
  });
});
