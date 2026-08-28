import { model } from "@open-agents/agent";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  completeTechnologySelection,
  createFallbackTechStack,
} from "@/lib/ai/tech-stack-fallback";
import { getSvglCatalog, selectRelevantSvglTechnologies } from "@/lib/svgl";
import { techStackRecommendationSchema } from "@/lib/tech-stack";

const STACK_RECOMMENDATION_MODEL = "openai/gpt-5.6-luna-fast";
const STACK_RECOMMENDATION_TIMEOUT_MS = 7000;

export async function recommendTechStack({
  productRequest,
  abortSignal,
}: {
  productRequest: string;
  abortSignal?: AbortSignal;
}) {
  const catalog = await getSvglCatalog();
  const candidates = selectRelevantSvglTechnologies(catalog, productRequest);
  const modelOutputSchema = z.object({
    headline: z.string().min(1).max(70),
    summaryMarkdown: z.string().min(1).max(500),
    technologyNames: z.array(z.string()).min(2).max(8),
    tradeoffMarkdown: z.string().min(1).max(220),
  });
  const compactCatalog = candidates
    .map(({ name, role }) => `${name} [${role}]`)
    .join("; ");

  try {
    const { output } = await generateText({
      model: model(STACK_RECOMMENDATION_MODEL, {
        providerOptionsOverrides: {
          openai: { reasoningEffort: "minimal" },
          openrouter: { provider: { sort: "latency" } },
        },
      }),
      output: Output.object({ schema: modelOutputSchema }),
      maxOutputTokens: 480,
      maxRetries: 0,
      temperature: 0.1,
      timeout: STACK_RECOMMENDATION_TIMEOUT_MS,
      abortSignal,
      system: `Act as a pragmatic staff engineer. Select the smallest sufficient production stack from the supplied SVGL catalog.

Return 2-8 unique technology names exactly as written in the catalog. Never add databases, payments, hosting, or frameworks unless the request needs them. The headline must be plain text and no more than 7 words. summaryMarkdown must explain how the pieces connect in 2-3 short sentences, using bold only for technology names. tradeoffMarkdown must be one candid sentence. Do not include headings or repeat field labels inside field values.`,
      prompt: `SVGL catalog: ${compactCatalog}\n\nProduct request: ${productRequest}`,
    });

    const selectedTechnologies = completeTechnologySelection({
      candidates,
      productRequest,
      requestedNames: output.technologyNames,
    });

    const recommendation = techStackRecommendationSchema.safeParse({
      headline: output.headline,
      summaryMarkdown: output.summaryMarkdown,
      technologies: selectedTechnologies,
      tradeoffMarkdown: output.tradeoffMarkdown,
    });
    if (recommendation.success) return recommendation.data;

    console.warn(
      "[recommend-stack] Completed an invalid model recommendation locally:",
      recommendation.error,
    );
    return createFallbackTechStack(
      candidates,
      productRequest,
      output.technologyNames,
    );
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    console.warn("[recommend-stack] Using a local recommendation:", error);
    return createFallbackTechStack(candidates, productRequest);
  }
}
