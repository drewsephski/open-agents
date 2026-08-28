import type { ProviderMetadata } from "ai";

export interface NormalizedModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  cost?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getOpenRouterUsage(
  providerMetadata: ProviderMetadata | undefined,
): Record<string, unknown> | undefined {
  if (!providerMetadata) {
    return undefined;
  }

  const openrouter = (providerMetadata as Record<string, unknown>).openrouter;
  if (!isRecord(openrouter)) {
    return undefined;
  }

  return isRecord(openrouter.usage) ? openrouter.usage : undefined;
}

/**
 * Normalize OpenRouter provider metadata into a stable internal usage shape.
 * Application code should consume this instead of OpenRouter's raw metadata.
 */
export function extractNormalizedUsage(
  providerMetadata: ProviderMetadata | undefined,
): NormalizedModelUsage {
  const usage = getOpenRouterUsage(providerMetadata);
  if (!usage) {
    return {};
  }

  const promptTokensDetails = isRecord(usage.promptTokensDetails)
    ? usage.promptTokensDetails
    : undefined;
  const completionTokensDetails = isRecord(usage.completionTokensDetails)
    ? usage.completionTokensDetails
    : undefined;

  return {
    inputTokens: toFiniteNumber(usage.promptTokens ?? usage.inputTokens),
    outputTokens: toFiniteNumber(usage.completionTokens ?? usage.outputTokens),
    reasoningTokens: toFiniteNumber(
      completionTokensDetails?.reasoningTokens ?? usage.reasoningTokens,
    ),
    cachedTokens: toFiniteNumber(
      promptTokensDetails?.cachedTokens ?? usage.cachedTokens,
    ),
    cost: toFiniteNumber(usage.cost),
  };
}

export function extractModelCost(
  providerMetadata: ProviderMetadata | undefined,
): number | undefined {
  return extractNormalizedUsage(providerMetadata).cost;
}
