import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type JSONValue,
  type LanguageModel,
} from "ai";
import {
  OPENROUTER_APP_NAME,
  MissingOpenRouterApiKeyError,
  requireOpenRouterApiKey,
  resolveCanonicalAppUrl,
  resolveDefaultModelId,
  type ModelId,
} from "./model-id";
import {
  getProviderOptionsForModel,
  type ProviderOptionsByProvider,
} from "./provider-options";
import {
  type InferenceAccountingCallbacks,
  withInferenceAccounting,
} from "./inference-accounting";

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
  /** Server-only callbacks for one authorized provider call. */
  accounting?: InferenceAccountingCallbacks;
}

export interface ModelFactoryOptions {
  config: OpenRouterConfig;
  providerOptionsOverrides?: ProviderOptionsByProvider;
  appName?: string;
  appUrl?: string;
}

function getOpenRouterProvider(
  options: ModelFactoryOptions,
): ReturnType<typeof createOpenRouter> {
  if (!options.config) {
    throw new MissingOpenRouterApiKeyError();
  }
  const apiKey = requireOpenRouterApiKey(options.config.apiKey);
  const appName = options.appName ?? OPENROUTER_APP_NAME;
  const appUrl = resolveCanonicalAppUrl(options.appUrl);

  return createOpenRouter({
    apiKey,
    ...(options.config.baseURL ? { baseURL: options.config.baseURL } : {}),
    compatibility: "strict",
    appName,
    ...(appUrl ? { appUrl } : {}),
  });
}

/**
 * Shared OpenRouter language-model factory.
 *
 * Every model invocation in this repo should go through this function so
 * OpenRouter remains the only model transport.
 */
export function model(
  modelId: ModelId,
  options: ModelFactoryOptions,
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

  if (options.config.accounting) {
    if (
      typeof languageModel === "string" ||
      languageModel.specificationVersion !== "v3"
    ) {
      throw new Error("Inference accounting requires a v3 language model");
    }
    languageModel = withInferenceAccounting(
      languageModel,
      options.config.accounting,
    );
  }

  return languageModel;
}

export function defaultLanguageModel(
  options: ModelFactoryOptions,
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
