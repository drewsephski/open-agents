import "server-only";

import {
  fetchOpenRouterLanguageModels,
  type OpenRouterCatalogModel,
} from "@open-agents/agent/model-catalog";
import { z } from "zod";
import { filterDisabledModels } from "./model-availability";
import type {
  AvailableModel,
  AvailableModelCost,
  AvailableModelCostTier,
  CatalogLanguageModel,
} from "./models";

const MODELS_DEV_URL = "https://models.dev/api.json";
const MODELS_DEV_TIMEOUT_MS = 750;

type CatalogModel = CatalogLanguageModel;

interface ModelsDevMetadata {
  contextWindow?: number;
  cost?: AvailableModelCost;
}

const recordSchema = z.object({}).catchall(z.unknown());

const modelsDevLimitSchema = z
  .object({
    context: z.number().finite().positive().optional(),
  })
  .passthrough();

const modelsDevCostTierSchema = z
  .object({
    input: z.number().finite().optional(),
    output: z.number().finite().optional(),
    cache_read: z.number().finite().optional(),
  })
  .passthrough();

function getModelsDevCostTier(
  value: unknown,
): AvailableModelCostTier | undefined {
  const parsed = modelsDevCostTierSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }

  const { input, output, cache_read } = parsed.data;
  if (input === undefined && output === undefined && cache_read === undefined) {
    return undefined;
  }

  return {
    input,
    output,
    cache_read,
  };
}

function getModelsDevCost(value: unknown): AvailableModelCost | undefined {
  const parsed = recordSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }

  const baseCost = getModelsDevCostTier(parsed.data);
  const contextOver200k = getModelsDevCostTier(parsed.data.context_over_200k);

  if (!baseCost && !contextOver200k) {
    return undefined;
  }

  return {
    ...baseCost,
    ...(contextOver200k ? { context_over_200k: contextOver200k } : {}),
  };
}

function getModelsDevMetadataMap(
  data: unknown,
): Map<string, ModelsDevMetadata> {
  const metadataMap = new Map<string, ModelsDevMetadata>();
  const providers = recordSchema.safeParse(data);
  if (!providers.success) {
    return metadataMap;
  }

  for (const [providerKey, providerValue] of Object.entries(providers.data)) {
    const provider = recordSchema.safeParse(providerValue);
    if (!provider.success) {
      continue;
    }

    const models = recordSchema.safeParse(provider.data.models);
    if (!models.success) {
      continue;
    }

    for (const [modelKey, modelValue] of Object.entries(models.data)) {
      const model = recordSchema.safeParse(modelValue);
      if (!model.success) {
        continue;
      }

      const parsedId = z.string().safeParse(model.data.id);
      const rawId = parsedId.success ? parsedId.data : modelKey;
      const modelId = rawId.includes("/") ? rawId : `${providerKey}/${rawId}`;

      const parsedLimit = modelsDevLimitSchema.safeParse(model.data.limit);
      const contextWindow = parsedLimit.success
        ? parsedLimit.data.context
        : undefined;
      const cost = getModelsDevCost(model.data.cost);

      if (contextWindow === undefined && cost === undefined) {
        continue;
      }

      metadataMap.set(modelId, {
        contextWindow,
        cost,
      });
    }
  }

  return metadataMap;
}

async function fetchModelsDevMetadataMap(): Promise<
  Map<string, ModelsDevMetadata>
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODELS_DEV_TIMEOUT_MS);

  try {
    const response = await fetch(MODELS_DEV_URL, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return new Map();
    }
    const data: unknown = await response.json();
    return getModelsDevMetadataMap(data);
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeoutId);
  }
}

function addModelsDevMetadata(
  model: CatalogModel,
  metadataMap: Map<string, ModelsDevMetadata>,
): AvailableModel {
  const metadata = metadataMap.get(model.id);
  if (!metadata) {
    return model;
  }

  const nextModel: AvailableModel = { ...model };

  if (
    typeof metadata.contextWindow === "number" &&
    metadata.contextWindow > 0
  ) {
    nextModel.context_window = metadata.contextWindow;
  }

  if (metadata.cost) {
    nextModel.cost = metadata.cost;
  }

  return nextModel;
}

function toAvailableModel(model: OpenRouterCatalogModel): AvailableModel {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    modelType: model.modelType,
    ...(model.context_window ? { context_window: model.context_window } : {}),
    ...(model.cost ? { cost: model.cost } : {}),
  };
}

export async function fetchAvailableLanguageModels(): Promise<
  AvailableModel[]
> {
  const models = await fetchOpenRouterLanguageModels();
  return filterDisabledModels(models.map(toAvailableModel));
}

export async function fetchAvailableLanguageModelsWithContext(): Promise<
  AvailableModel[]
> {
  const [models, modelsDevMetadataMap] = await Promise.all([
    fetchAvailableLanguageModels(),
    fetchModelsDevMetadataMap(),
  ]);

  return models.map((model) =>
    addModelsDevMetadata(model, modelsDevMetadataMap),
  );
}
