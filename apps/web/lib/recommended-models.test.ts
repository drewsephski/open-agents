import { describe, expect, test } from "bun:test";
import { getRecommendedModels } from "./recommended-models";

describe("getRecommendedModels", () => {
  test("picks the first available id for each role", () => {
    const options = [
      { id: "anthropic/claude-fable-5" },
      { id: "openai/gpt-5.6-luna" },
      { id: "z-ai/glm-5.3-flash" },
      { id: "z-ai/glm-5.3" },
    ];

    expect(getRecommendedModels(options)).toEqual([
      { id: "z-ai/glm-5.3-flash" },
      { id: "openai/gpt-5.6-luna" },
      { id: "anthropic/claude-fable-5" },
    ]);
  });

  test("skips roles whose models are missing from the catalog", () => {
    const options = [{ id: "z-ai/glm-5.3-flash" }, { id: "openai/gpt-4o" }];

    expect(getRecommendedModels(options)).toEqual([
      { id: "z-ai/glm-5.3-flash" },
    ]);
  });
});
