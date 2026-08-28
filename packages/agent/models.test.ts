import { afterAll, describe, expect, mock, test } from "bun:test";
import type { ProviderOptionsByProvider } from "./provider-options";

const createOpenRouterCalls: Array<Record<string, unknown>> = [];
const chatCalls: Array<{
  modelId: string;
  settings?: Record<string, unknown>;
}> = [];

mock.module("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (settings?: Record<string, unknown>) => {
    createOpenRouterCalls.push(settings ?? {});
    const chat = (modelId: string, modelSettings?: Record<string, unknown>) => {
      chatCalls.push({ modelId, settings: modelSettings });
      return {
        modelId,
        provider: "openrouter",
      };
    };
    return Object.assign(chat, { chat });
  },
}));

mock.module("ai", () => ({
  defaultSettingsMiddleware: (_settings: unknown) => ({
    kind: "default-settings-middleware",
  }),
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
}));

const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_MODEL;
const originalProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const originalPublicProductionUrl =
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;

process.env.OPENROUTER_API_KEY = "test-openrouter-key";
delete process.env.OPENROUTER_MODEL;
delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
delete process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;

const {
  DEFAULT_OPENROUTER_MODEL_ID,
  MissingOpenRouterApiKeyError,
  defaultLanguageModel,
  getProviderOptionsForModel,
  mergeProviderOptions,
  model,
  resolveDefaultModelId,
  shouldApplyOpenAIReasoningDefaults,
} = await import("./models");

describe("resolveDefaultModelId", () => {
  test("defaults to GLM 5.3 Flash", () => {
    expect(resolveDefaultModelId({})).toBe("z-ai/glm-5.3-flash");
    expect(DEFAULT_OPENROUTER_MODEL_ID).toBe("z-ai/glm-5.3-flash");
  });

  test("honors OPENROUTER_MODEL override", () => {
    expect(
      resolveDefaultModelId({
        OPENROUTER_MODEL: "anthropic/claude-sonnet-4.6",
      }),
    ).toBe("anthropic/claude-sonnet-4.6");
  });
});

describe("shouldApplyOpenAIReasoningDefaults", () => {
  test("returns true for existing GPT-5 variants", () => {
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-5.3")).toBe(true);
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-5.6-luna")).toBe(
      true,
    );
  });

  test("returns true for future GPT-5 variants", () => {
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-5.9")).toBe(true);
  });

  test("returns false for non-GPT-5 OpenAI models", () => {
    expect(shouldApplyOpenAIReasoningDefaults("openai/gpt-4o")).toBe(false);
  });
});

describe("getProviderOptionsForModel", () => {
  test("translates adaptive Anthropic thinking to OpenRouter reasoning effort", () => {
    expect(getProviderOptionsForModel("anthropic/claude-sonnet-4.6")).toEqual({
      openrouter: {
        reasoning: { effort: "medium" },
      },
    });
  });

  test("translates Anthropic 4.7 adaptive thinking to OpenRouter reasoning effort", () => {
    expect(getProviderOptionsForModel("anthropic/claude-opus-4.7")).toEqual({
      openrouter: {
        reasoning: { effort: "medium" },
      },
    });
  });

  test("translates legacy Anthropic thinking budget to OpenRouter max_tokens", () => {
    expect(getProviderOptionsForModel("anthropic/claude-opus-4.5")).toEqual({
      openrouter: {
        reasoning: { max_tokens: 8000 },
      },
    });
  });

  test("translates OpenAI GPT-5 reasoning effort and drops Responses-only options", () => {
    expect(
      getProviderOptionsForModel("openai/gpt-5", {
        openai: {
          reasoningEffort: "medium",
          store: false,
          reasoningSummary: "detailed",
          include: ["reasoning.encrypted_content"],
        },
      }),
    ).toEqual({
      openrouter: {
        reasoning: { effort: "medium" },
      },
    });
  });

  test("does not emit OpenAI Responses defaults for GPT-5.6 Luna", () => {
    expect(getProviderOptionsForModel("openai/gpt-5.6-luna")).toEqual({});
  });

  test("maps GPT-5.6 Luna xhigh reasoning variants through OpenRouter", () => {
    expect(
      getProviderOptionsForModel("openai/gpt-5.6-luna", {
        openai: {
          reasoningEffort: "xhigh",
          reasoningSummary: "auto",
          store: false,
          textVerbosity: "low",
        },
      }),
    ).toEqual({
      openrouter: {
        reasoning: { effort: "xhigh" },
      },
    });
  });

  test("maps Anthropic max effort to OpenRouter xhigh", () => {
    expect(
      getProviderOptionsForModel("anthropic/claude-opus-4.6", {
        anthropic: { effort: "max" },
      }),
    ).toEqual({
      openrouter: {
        reasoning: { effort: "xhigh" },
      },
    });
  });

  test("returns no provider options for GLM", () => {
    expect(getProviderOptionsForModel("z-ai/glm-5.3-flash")).toEqual({});
  });
});

describe("mergeProviderOptions", () => {
  test("returns defaults when overrides are undefined", () => {
    const defaults: ProviderOptionsByProvider = {
      openai: {
        reasoningEffort: "high",
      },
    };

    expect(mergeProviderOptions(defaults)).toEqual(defaults);
  });

  test("deep merges nested provider options", () => {
    const defaults: ProviderOptionsByProvider = {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,
        },
      },
    };

    const overrides: ProviderOptionsByProvider = {
      anthropic: {
        thinking: {
          budgetTokens: 4000,
        },
      },
    };

    expect(mergeProviderOptions(defaults, overrides)).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 4000,
        },
      },
    });
  });
});

describe("model factory", () => {
  test("throws when OPENROUTER_API_KEY is missing", () => {
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      expect(() => model("z-ai/glm-5.3-flash")).toThrow(
        MissingOpenRouterApiKeyError,
      );
    } finally {
      process.env.OPENROUTER_API_KEY = previous;
    }
  });

  test("creates OpenRouter chat models with usage accounting and Launchstack attribution", () => {
    createOpenRouterCalls.length = 0;
    chatCalls.length = 0;

    defaultLanguageModel();

    expect(chatCalls).toEqual([
      {
        modelId: "z-ai/glm-5.3-flash",
        settings: { usage: { include: true } },
      },
    ]);
    expect(createOpenRouterCalls[0]).toMatchObject({
      apiKey: "test-openrouter-key",
      compatibility: "strict",
      appName: "Launchstack",
      appUrl: "https://launchstack.sh",
    });
  });

  test("passes canonical app URL when available", () => {
    createOpenRouterCalls.length = 0;
    model("z-ai/glm-5.3-flash", {
      appUrl: "https://launchstack.example",
    });

    expect(createOpenRouterCalls.at(-1)).toMatchObject({
      appName: "Launchstack",
      appUrl: "https://launchstack.example",
    });
  });

  test("does not use Vercel AI Gateway", () => {
    const source = [createOpenRouterCalls[0], chatCalls[0]];
    expect(JSON.stringify(source)).not.toContain("createGateway");
  });
});

afterAll(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  }

  if (originalModel === undefined) {
    delete process.env.OPENROUTER_MODEL;
  } else {
    process.env.OPENROUTER_MODEL = originalModel;
  }

  if (originalProductionUrl === undefined) {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  } else {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = originalProductionUrl;
  }

  if (originalPublicProductionUrl === undefined) {
    delete process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  } else {
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL =
      originalPublicProductionUrl;
  }
});
