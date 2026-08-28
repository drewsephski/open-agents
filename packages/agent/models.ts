import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type JSONValue,
  type LanguageModel,
} from "ai";
import {
  OPENROUTER_APP_NAME,
  requireOpenRouterApiKey,
  resolveCanonicalAppUrl,
  resolveDefaultModelId,
  type ModelId,
} from "./model-id";
import {
  getProviderOptionsForModel,
  type ProviderOptionsByProvider,
} from "./provider-options";

export type { JSONValue, LanguageModel, ModelId, ProviderOptionsByProvider };
export {
  getProviderOptionsForModel,
  mergeProviderOptions,
  shouldApplyOpenAIReasoningDefaults,
  translateToOpenRouterProviderOptions,
} from "./provider-options";
export {
  DEFAULT_OPENROUTER_MODEL_ID,
  MissingOpenRouterApiKeyError,
  OPENROUTER_APP_NAME,
  OPENROUTER_APP_URL,
  resolveCanonicalAppUrl,
  resolveDefaultModelId,
  requireOpenRouterApiKey,
} from "./model-id";

export interface OpenRouterConfig {
  apiKey: string;
  baseURL?: string;
}

export interface ModelFactoryOptions {
  config?: OpenRouterConfig;
  providerOptionsOverrides?: ProviderOptionsByProvider;
  appName?: string;
  appUrl?: string;
}

const providerCache = new Map<string, ReturnType<typeof createOpenRouter>>();

function getProviderCacheKey(parts: {
  apiKey: string;
  baseURL?: string;
  appName: string;
  appUrl?: string;
}): string {
  return JSON.stringify(parts);
}

function getOpenRouterProvider(
  options: ModelFactoryOptions,
): ReturnType<typeof createOpenRouter> {
  const apiKey = requireOpenRouterApiKey(options.config?.apiKey);
  const appName = options.appName ?? OPENROUTER_APP_NAME;
  const appUrl = resolveCanonicalAppUrl(options.appUrl);
  const cacheKey = getProviderCacheKey({
    apiKey,
    baseURL: options.config?.baseURL,
    appName,
    appUrl,
  });

  const cached = providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const provider = createOpenRouter({
    apiKey,
    ...(options.config?.baseURL ? { baseURL: options.config.baseURL } : {}),
    compatibility: "strict",
    appName,
    ...(appUrl ? { appUrl } : {}),
  });

  providerCache.set(cacheKey, provider);
  return provider;
}

/**
 * Shared OpenRouter language-model factory.
 *
 * Every model invocation in this repo should go through this function so
 * OpenRouter remains the only model transport.
 */
export function model(
  modelId: ModelId,
  options: ModelFactoryOptions = {},
): LanguageModel {
  const provider = getOpenRouterProvider(options);
  let languageModel: LanguageModel = provider.chat(modelId, {
    usage: { include: true },
  });

  const providerOptions = getProviderOptionsForModel(
    modelId,
    options.providerOptionsOverrides,
  );

  if (Object.keys(providerOptions).length > 0) {
    languageModel = wrapLanguageModel({
      model: languageModel,
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions },
      }),
    });
  }

  return languageModel;
}

export function defaultLanguageModel(
  options: ModelFactoryOptions = {},
): LanguageModel {
  return model(resolveDefaultModelId(), options);
}

/**
 * Placeholder for ToolLoopAgent constructors. Real OpenRouter transport is
 * created in prepareCall / defaultLanguageModel() so importing this package
 * does not require OPENROUTER_API_KEY.
 */
export function constructorPlaceholderModel(
  modelId: ModelId = resolveDefaultModelId(),
): LanguageModel {
  return {
    specificationVersion: "v3",
    provider: "openrouter",
    modelId,
  } as LanguageModel;
}
