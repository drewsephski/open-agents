import type { JSONValue } from "ai";

export type ProviderOptionsByProvider = Record<
  string,
  Record<string, JSONValue>
>;

type OpenRouterReasoningEffort =
  | "xhigh"
  | "high"
  | "medium"
  | "low"
  | "minimal"
  | "none";

function isJsonObject(value: unknown): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProviderOptionsRecord(
  options: Record<string, unknown>,
): Record<string, JSONValue> {
  return options as Record<string, JSONValue>;
}

function mergeRecords(
  base: Record<string, JSONValue>,
  override: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const merged: Record<string, JSONValue> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existingValue = merged[key];

    if (isJsonObject(existingValue) && isJsonObject(value)) {
      merged[key] = mergeRecords(existingValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export function mergeProviderOptions(
  defaults: ProviderOptionsByProvider,
  overrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  if (!overrides || Object.keys(overrides).length === 0) {
    return defaults;
  }

  const merged: ProviderOptionsByProvider = { ...defaults };

  for (const [provider, providerOverrides] of Object.entries(overrides)) {
    const providerDefaults = merged[provider];

    if (!providerDefaults) {
      merged[provider] = providerOverrides;
      continue;
    }

    merged[provider] = mergeRecords(providerDefaults, providerOverrides);
  }

  return merged;
}

function supportsAdaptiveAnthropicThinking(modelId: string): boolean {
  return modelId.includes("4.6") || modelId.includes("4.7");
}

function getAnthropicIntent(modelId: string): Record<string, JSONValue> {
  if (supportsAdaptiveAnthropicThinking(modelId)) {
    return {
      effort: "medium",
      thinking: { type: "adaptive" },
    };
  }

  return {
    thinking: { type: "enabled", budgetTokens: 8000 },
  };
}

export function shouldApplyOpenAIReasoningDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5");
}

function mapReasoningEffort(effort: string): OpenRouterReasoningEffort {
  switch (effort) {
    case "max":
      return "xhigh";
    case "xhigh":
    case "high":
    case "medium":
    case "low":
    case "minimal":
    case "none":
      return effort;
    default:
      return "medium";
  }
}

function translateAnthropicIntent(
  anthropic: Record<string, JSONValue> | undefined,
): Record<string, JSONValue> {
  if (!anthropic) {
    return {};
  }

  const thinking = isJsonObject(anthropic.thinking)
    ? anthropic.thinking
    : undefined;
  const effort =
    typeof anthropic.effort === "string" ? anthropic.effort : undefined;

  if (thinking?.type === "adaptive" || effort) {
    return {
      reasoning: {
        effort: mapReasoningEffort(effort ?? "medium"),
      },
    };
  }

  if (thinking?.type === "enabled") {
    const budgetTokens =
      typeof thinking.budgetTokens === "number" ? thinking.budgetTokens : 8000;
    return {
      reasoning: {
        max_tokens: budgetTokens,
      },
    };
  }

  return {};
}

function translateOpenAIIntent(
  openai: Record<string, JSONValue> | undefined,
): Record<string, JSONValue> {
  if (!openai) {
    return {};
  }

  const reasoningEffort =
    typeof openai.reasoningEffort === "string"
      ? openai.reasoningEffort
      : undefined;

  if (!reasoningEffort) {
    return {};
  }

  return {
    reasoning: {
      effort: mapReasoningEffort(reasoningEffort),
    },
  };
}

/**
 * Converts model-specific provider intent (Anthropic thinking, OpenAI
 * reasoning effort, etc.) into OpenRouter provider options.
 *
 * Responses-API-only fields are dropped because they are not applicable
 * through OpenRouter:
 * - `store`
 * - `include: ["reasoning.encrypted_content"]`
 * - `reasoningSummary`
 * - `textVerbosity`
 */
export function translateToOpenRouterProviderOptions(
  intent: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  const translated = mergeRecords(
    translateAnthropicIntent(intent.anthropic),
    translateOpenAIIntent(intent.openai),
  );
  const openRouterOverrides = intent.openrouter ?? {};
  const openrouter = mergeRecords(translated, openRouterOverrides);

  if (Object.keys(openrouter).length === 0) {
    return {};
  }

  return { openrouter };
}

export function getProviderOptionsForModel(
  modelId: string,
  providerOptionsOverrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  const defaultProviderOptions: ProviderOptionsByProvider = {};

  if (modelId.startsWith("anthropic/")) {
    defaultProviderOptions.anthropic = toProviderOptionsRecord(
      getAnthropicIntent(modelId),
    );
  }

  const intent = mergeProviderOptions(
    defaultProviderOptions,
    providerOptionsOverrides,
  );

  return translateToOpenRouterProviderOptions(intent);
}
