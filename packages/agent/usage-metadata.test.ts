import { describe, expect, test } from "bun:test";
import { extractModelCost, extractNormalizedUsage } from "./usage-metadata";

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
