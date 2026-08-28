/**
 * Curated models shown at the top of selectors.
 *
 * Each spec lists preferred OpenRouter ids in order. The first id present in
 * the live catalog is used, so a missing or renamed model is skipped instead
 * of leaving a broken row.
 */
export interface RecommendedModelSpec {
  ids: readonly string[];
}

export const RECOMMENDED_MODEL_SPECS: readonly RecommendedModelSpec[] = [
  {
    ids: ["z-ai/glm-5.3-flash"],
  },
  {
    ids: ["openai/gpt-5.6-luna"],
  },
  {
    ids: ["anthropic/claude-fable-5"],
  },
];

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
