import { APP_DEFAULT_MODEL_ID } from "./models";

/**
 * Curated coding models shown at the top of selectors, verified against the
 * OpenRouter catalog on 2026-10-02: https://openrouter.ai/api/v1/models
 *
 * Each spec lists preferred OpenRouter ids in order. The first id present in
 * the live catalog is used, so a missing or renamed model is skipped instead
 * of leaving a broken row.
 */
export interface RecommendedModelSpec {
  ids: readonly string[];
  badge: string;
}

export const RECOMMENDED_MODEL_SPECS: readonly RecommendedModelSpec[] = [
  {
    ids: [APP_DEFAULT_MODEL_ID],
    badge: "Best overall",
  },
  {
    ids: ["anthropic/claude-opus-5.5"],
    badge: "Max performance",
  },
  {
    ids: ["anthropic/claude-sonnet-5.5"],
    badge: "Balanced",
  },
  {
    ids: ["openai/gpt-6-luna"],
    badge: "Best value",
  },
  {
    ids: ["openai/gpt-6-astra"],
    badge: "Advanced reasoning",
  },
  {
    ids: ["google/gemini-3.8-flash"],
    badge: "Fast",
  },
  {
    ids: ["x-ai/grok-4.7"],
    badge: "Frontier",
  },
  {
    ids: ["z-ai/glm-5.3-prime"],
    badge: "Open weights",
  },
];

export function getRecommendedModelBadge(modelId: string): string | undefined {
  return RECOMMENDED_MODEL_SPECS.find((spec) => spec.ids.includes(modelId))
    ?.badge;
}

export function getRecommendedModels<T extends { id: string }>(
  options: T[],
): T[] {
  const optionsById = new Map(options.map((option) => [option.id, option]));
  const usedIds = new Set<string>();
  const recommended: T[] = [];

  for (const spec of RECOMMENDED_MODEL_SPECS) {
    const matchId = spec.ids.find(
      (id) => optionsById.has(id) && !usedIds.has(id),
    );
    if (!matchId) {
      continue;
    }

    const option = optionsById.get(matchId);
    if (!option) {
      continue;
    }

    usedIds.add(matchId);
    recommended.push(option);
  }

  return recommended;
}
