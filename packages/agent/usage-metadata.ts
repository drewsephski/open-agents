import type { ProviderMetadata } from "ai";

export interface NormalizedModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  cost?: number;
}

export interface NormalizedModelCost {
  /** Exact normalized dollar amount accepted by numeric(18, 12). */
  usd: string;
  /** Conservative allowance charge, rounded up to the next dollar micro. */
  micros: number;
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

function normalizeCostValue(value: unknown): string | undefined {
  const candidate =
    typeof value === "number" && Number.isFinite(value)
      ? value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "")
      : typeof value === "string"
        ? value
        : undefined;
  if (candidate === undefined || !/^\d+(?:\.\d{1,12})?$/.test(candidate)) {
    return undefined;
  }

  const [wholePart = "0", fractionPart = ""] = candidate.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "");
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

/**
 * Read exact OpenRouter dollar cost for durable accounting. String metadata is
 * never converted through a floating point number. Allowance micros round up
 * so sub-micro charges cannot accumulate outside the managed limit.
 */
export function extractModelCostUsd(
  providerMetadata: ProviderMetadata | undefined,
): NormalizedModelCost | undefined {
  const usage = getOpenRouterUsage(providerMetadata);
  const usd = normalizeCostValue(usage?.cost);
  if (usd === undefined) {
    return undefined;
  }

  const micros = modelCostUsdToMicros(usd);
  return micros === undefined ? undefined : { usd, micros };
}

export function modelCostUsdToMicros(usd: string): number | undefined {
  if (!/^\d+(?:\.\d{1,12})?$/.test(usd)) return undefined;
  const [whole = "0", fraction = ""] = usd.split(".");
  const paddedFraction = fraction.padEnd(12, "0");
  const micros =
    Number(whole) * 1_000_000 +
    Number(paddedFraction.slice(0, 6)) +
    (/[1-9]/.test(paddedFraction.slice(6)) ? 1 : 0);
  return Number.isSafeInteger(micros) ? micros : undefined;
}
