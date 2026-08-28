import { z } from "zod";
import { requireOpenRouterApiKey } from "./model-id";

const OPENROUTER_MODELS_URL =
  "https://openrouter.ai/api/v1/models?output_modalities=text";
const OPENROUTER_MODELS_TIMEOUT_MS = 8_000;
const TOKENS_PER_MILLION = 1_000_000;

type CatalogFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface CatalogModelCost {
  input?: number;
  output?: number;
  cache_read?: number;
}

export interface OpenRouterCatalogModel {
  id: string;
  name: string;
  description?: string | null;
  modelType: "language";
  context_window?: number;
  cost?: CatalogModelCost;
}

const recordSchema = z.object({}).catchall(z.unknown());

const catalogModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullish(),
    context_length: z.number().finite().positive().optional(),
    architecture: z
      .object({
        output_modalities: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    pricing: recordSchema.optional(),
  })
  .passthrough();

const catalogResponseSchema = z.object({
  data: z.array(z.unknown()),
});

function toPerMillionPrice(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Number((parsed * TOKENS_PER_MILLION).toFixed(6));
}

function getCatalogCost(pricing: unknown): CatalogModelCost | undefined {
  const parsed = recordSchema.safeParse(pricing);
  if (!parsed.success) {
    return undefined;
  }

  const input = toPerMillionPrice(parsed.data.prompt);
  const output = toPerMillionPrice(parsed.data.completion);
  const cache_read = toPerMillionPrice(parsed.data.input_cache_read);

  if (input === undefined && output === undefined && cache_read === undefined) {
    return undefined;
  }

  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(cache_read === undefined ? {} : { cache_read }),
  };
}

function isLanguageModel(model: z.infer<typeof catalogModelSchema>): boolean {
  const outputModalities = model.architecture?.output_modalities;
  if (!outputModalities || outputModalities.length === 0) {
    return true;
  }
  return outputModalities.includes("text");
}

function toCatalogModel(value: unknown): OpenRouterCatalogModel | undefined {
  const parsed = catalogModelSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }

  if (!isLanguageModel(parsed.data)) {
    return undefined;
  }

  const cost = getCatalogCost(parsed.data.pricing);
  const contextWindow = parsed.data.context_length;

  return {
    id: parsed.data.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    modelType: "language",
    ...(typeof contextWindow === "number"
      ? { context_window: contextWindow }
      : {}),
    ...(cost ? { cost } : {}),
  };
}

export async function fetchOpenRouterLanguageModels(options?: {
  apiKey?: string;
  fetchImpl?: CatalogFetch;
}): Promise<OpenRouterCatalogModel[]> {
  const apiKey = requireOpenRouterApiKey(
    options?.apiKey ?? process.env.OPENROUTER_API_KEY,
  );
  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    OPENROUTER_MODELS_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(OPENROUTER_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter model catalog request failed with status ${response.status}.`,
      );
    }

    const json: unknown = await response.json();
    const parsed = catalogResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        "OpenRouter model catalog returned an unexpected payload.",
      );
    }

    return parsed.data.data.flatMap((entry) => {
      const model = toCatalogModel(entry);
      return model ? [model] : [];
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
