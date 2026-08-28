import { describe, expect, test } from "bun:test";
import { addCacheControl } from "./cache-control";

const anthropicThroughOpenRouter = {
  provider: "openrouter",
  modelId: "anthropic/claude-sonnet-4.6",
} as const;

const glmModel = {
  provider: "openrouter",
  modelId: "z-ai/glm-5.3-flash",
} as const;

describe("addCacheControl", () => {
  test("marks the last message with OpenRouter and Anthropic cache control", () => {
    const messages = addCacheControl({
      messages: [
        { role: "user", content: "first" },
        { role: "user", content: "last" },
      ],
      model: anthropicThroughOpenRouter as never,
    });

    expect(messages[0]).toEqual({ role: "user", content: "first" });
    expect(messages[1]).toMatchObject({
      role: "user",
      content: "last",
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
        openrouter: { cacheControl: { type: "ephemeral" } },
      },
    });
  });

  test("marks only the last tool when routing Anthropic through OpenRouter", () => {
    const tools = addCacheControl({
      tools: {
        read: { description: "read" },
        bash: { description: "bash" },
      } as never,
      model: anthropicThroughOpenRouter as never,
    }) as {
      read?: { providerOptions?: unknown };
      bash?: { providerOptions?: unknown };
    };

    expect(tools.read?.providerOptions).toBeUndefined();
    expect(tools.bash?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
      openrouter: { cacheControl: { type: "ephemeral" } },
    });
  });

  test("does not add cache markers for GLM", () => {
    const messages = addCacheControl({
      messages: [{ role: "user", content: "hello" }],
      model: glmModel as never,
    });

    expect(messages).toEqual([{ role: "user", content: "hello" }]);
  });
});
