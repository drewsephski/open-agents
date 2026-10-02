import { describe, expect, test } from "bun:test";
import {
  getRecommendedModelBadge,
  getRecommendedModels,
} from "./recommended-models";

describe("getRecommendedModels", () => {
  test("picks the first available id for each role", () => {
    const options = [
      { id: "z-ai/glm-5.3-prime" },
      { id: "x-ai/grok-4.7" },
      { id: "google/gemini-3.8-flash" },
      { id: "openai/gpt-6-astra" },
      { id: "openai/gpt-6-luna" },
      { id: "anthropic/claude-sonnet-5.5" },
      { id: "anthropic/claude-opus-5.5" },
      { id: "openai/gpt-6.1-sol" },
      { id: "openai/gpt-5.6-luna" },
    ];

    expect(getRecommendedModels(options)).toEqual([
      { id: "openai/gpt-6.1-sol" },
      { id: "anthropic/claude-opus-5.5" },
      { id: "anthropic/claude-sonnet-5.5" },
      { id: "openai/gpt-6-luna" },
      { id: "openai/gpt-6-astra" },
      { id: "google/gemini-3.8-flash" },
      { id: "x-ai/grok-4.7" },
      { id: "z-ai/glm-5.3-prime" },
    ]);
  });

  test("skips roles whose models are missing from the catalog", () => {
    const options = [
      { id: "google/gemini-3.8-flash" },
      { id: "openai/gpt-4o" },
    ];

    expect(getRecommendedModels(options)).toEqual([
      { id: "google/gemini-3.8-flash" },
    ]);
  });

  test("returns no recommendations when no curated models are available", () => {
    expect(getRecommendedModels([{ id: "openai/gpt-4o" }])).toEqual([]);
    expect(getRecommendedModels([])).toEqual([]);
  });

  test("returns the concise recommendation badge for each curated model", () => {
    expect(getRecommendedModelBadge("openai/gpt-6-luna")).toBe("Best value");
    expect(getRecommendedModelBadge("openai/gpt-6.1-sol")).toBe("Best overall");
    expect(getRecommendedModelBadge("anthropic/claude-opus-5.5")).toBe(
      "Max performance",
    );
    expect(getRecommendedModelBadge("anthropic/claude-sonnet-5.5")).toBe(
      "Balanced",
    );
    expect(getRecommendedModelBadge("openai/gpt-6-astra")).toBe(
      "Advanced reasoning",
    );
    expect(getRecommendedModelBadge("google/gemini-3.8-flash")).toBe("Fast");
    expect(getRecommendedModelBadge("x-ai/grok-4.7")).toBe("Frontier");
    expect(getRecommendedModelBadge("z-ai/glm-5.3-prime")).toBe("Open weights");
    expect(getRecommendedModelBadge("deepseek/deepseek-v4-flash")).toBe(
      undefined,
    );
  });
});
