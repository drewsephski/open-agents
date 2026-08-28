import { defaultLanguageModel } from "@open-agents/agent";
import { generateText, Output } from "ai";
import { z } from "zod";
import { technologies, techStackRecommendationSchema } from "@/lib/tech-stack";

const STACK_RECOMMENDATION_TIMEOUT_MS = 8000;

const compactRecommendationSchema = z.object({
  technologyIds: techStackRecommendationSchema.shape.technologyIds,
});

const catalog = technologies
  .map(({ id, name, role }) => `${id}=${name} (${role})`)
  .join("; ");

function getHeadline(technologyIds: readonly string[]): string {
  if (technologyIds.includes("expo")) return "A focused native foundation";
  if (technologyIds.includes("fastapi")) return "A focused Python foundation";
  if (technologyIds.includes("cloudflare")) return "A focused edge foundation";
  return "A focused full-stack foundation";
}

function getSummary(technologyIds: readonly string[]): string {
  const names = technologyIds
    .map((id) => technologies.find((technology) => technology.id === id)?.name)
    .filter((name) => name !== undefined);
  const stackLabel = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format(names);
  return `${stackLabel} form a lean, production-ready foundation for this product.`;
}

function getTradeoff(technologyIds: readonly string[]): string {
  if (technologyIds.includes("expo")) {
    return "Optimized for one cross-platform native codebase rather than fully bespoke platform code.";
  }
  if (technologyIds.includes("cloudflare")) {
    return "Optimized for edge performance, with more runtime constraints than a traditional server.";
  }
  if (technologyIds.includes("supabase")) {
    return "Managed backend speed comes with greater platform coupling as the product grows.";
  }
  return "Optimized for fast delivery; unusually complex scale may eventually require specialized services.";
}

export async function recommendTechStack({
  productRequest,
  abortSignal,
}: {
  productRequest: string;
  abortSignal?: AbortSignal;
}) {
  const { output } = await generateText({
    model: defaultLanguageModel({
      providerOptionsOverrides: {
        openrouter: { provider: { sort: "latency" } },
      },
    }),
    output: Output.object({ schema: compactRecommendationSchema }),
    maxOutputTokens: 100,
    maxRetries: 0,
    temperature: 0.1,
    timeout: STACK_RECOMMENDATION_TIMEOUT_MS,
    abortSignal,
    system:
      "Select only the smallest sufficient production stack. Return 2-6 unique IDs from the catalog. Never add databases, payments, hosting, or web frameworks unless the request needs them.",
    prompt: `Catalog: ${catalog}\nProduct: ${productRequest}`,
  });

  if (!output) throw new Error("The model returned no recommendation");

  const technologyIds = [...new Set(output.technologyIds)];
  return techStackRecommendationSchema.parse({
    headline: getHeadline(technologyIds),
    summary: getSummary(technologyIds),
    technologyIds,
    tradeoff: getTradeoff(technologyIds),
  });
}
