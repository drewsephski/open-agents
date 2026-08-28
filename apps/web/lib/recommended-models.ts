/**
 * Curated models shown at the top of selectors.
 *
 * Each spec lists preferred OpenRouter ids in order. The first id present in
 * the live catalog is used, so a missing or renamed model is skipped instead
 * of leaving a broken row.
 */
export interface RecommendedModelSpec {
  ids: readonly string[];
  label: string;
}

export interface RecommendedModel<T extends { id: string }> {
  option: T;
  label: string;
}

export const RECOMMENDED_MODEL_SPECS: readonly RecommendedModelSpec[] = [
  {
    ids: ["z-ai/glm-5.3-flash"],
    label: "Most cost-effective",
  },
  {
    ids: ["openai/gpt-5.6-luna"],
    label: "Best for code",
  },
  {
    ids: ["anthropic/claude-fable-5"],
    label: "Best performance",
  },
];

export function getRecommendedModels<T extends { id: string }>(
  options: T[],
): RecommendedModel<T>[] {
  const optionsById = new Map(options.map((option) => [option.id, option]));
  const usedIds = new Set<string>();
  const recommended: RecommendedModel<T>[] = [];

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
    recommended.push({ option, label: spec.label });
  }

  return recommended;
}
