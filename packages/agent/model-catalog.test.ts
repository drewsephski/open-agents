import { describe, expect, test } from "bun:test";
import { fetchOpenRouterLanguageModels } from "./model-catalog";

const originalApiKey = process.env.OPENROUTER_API_KEY;

describe("fetchOpenRouterLanguageModels", () => {
  test("throws when the API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(
        fetchOpenRouterLanguageModels({
          apiKey: "",
          fetchImpl: async () => new Response("{}", { status: 200 }),
        }),
      ).rejects.toThrow("OPENROUTER_API_KEY is not configured");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalApiKey;
      }
    }
  });

  test("maps OpenRouter catalog entries and skips non-language models", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "z-ai/glm-5.3-flash",
              name: "GLM 5.3 Flash",
              description: "Default Launchstack model",
              context_length: 128000,
              architecture: { output_modalities: ["text"] },
              pricing: {
                prompt: "0.000001",
                completion: "0.000004",
                input_cache_read: "0.0000005",
              },
            },
            {
              id: "cohere/rerank-v3.5",
              name: "Cohere Rerank 3.5",
              architecture: { output_modalities: ["rerank"] },
            },
            {
              id: "broken",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const models = await fetchOpenRouterLanguageModels({
      apiKey: "test-openrouter-key",
      fetchImpl,
    });

    expect(models).toEqual([
      {
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash",
        description: "Default Launchstack model",
        modelType: "language",
        context_window: 128000,
        cost: {
          input: 1,
          output: 4,
          cache_read: 0.5,
        },
      },
    ]);
  });
});
