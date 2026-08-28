import { model } from "@open-agents/agent";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getSvglCatalog } from "@/lib/svgl";
import { techStackRecommendationSchema } from "@/lib/tech-stack";

const STACK_RECOMMENDATION_MODEL = "openai/gpt-5.6-luna";
const STACK_RECOMMENDATION_TIMEOUT_MS = 12_000;

export async function recommendTechStack({
  productRequest,
  abortSignal,
}: {
  productRequest: string;
  abortSignal?: AbortSignal;
}) {
  const catalog = await getSvglCatalog();
  const modelOutputSchema = z.object({
    headline: z.string().min(1).max(70),
    technologyNames: z.array(z.string()).min(4).max(12),
    responsibilities: z
      .array(
        z.object({
          technologyName: z.string().min(1),
          responsibility: z.string().min(1).max(120),
        }),
      )
      .min(4)
      .max(12),
    tradeoffMarkdown: z.string().min(1).max(220),
  });
  const compactCatalog = catalog
    .map(({ name, role }) => `${name} [${role}]`)
    .join("; ");

  const { output } = await generateText({
    model: model(STACK_RECOMMENDATION_MODEL, {
      providerOptionsOverrides: {
        openai: { reasoningEffort: "minimal" },
        openrouter: { provider: { sort: "latency" } },
      },
    }),
    output: Output.object({ schema: modelOutputSchema }),
    maxOutputTokens: 1200,
    maxRetries: 0,
    temperature: 0.1,
    timeout: STACK_RECOMMENDATION_TIMEOUT_MS,
    abortSignal,
    system: `Act as a pragmatic staff engineer designing specifically for the supplied product brief. Select the smallest sufficient production stack from the supplied SVGL catalog.

Return 4-12 unique technology names exactly as written in the catalog. Every catalog entry is eligible; do not favor a conventional default stack. Select only what the brief actually needs, but include every core technology explicitly named in the brief when it exists in the catalog. For every selected technology, return one concrete responsibility describing what it handles in this product, not its generic category. The headline must name or characterize the product in no more than 7 words. Avoid generic phrases such as production-ready foundation, managed services, or product experience. tradeoffMarkdown must be one candid sentence specific to this architecture.`,
    prompt: `SVGL catalog: ${compactCatalog}\n\nProduct request: ${productRequest}`,
  });

  const selectedTechnologies = output.technologyNames.flatMap((name) => {
    const technology = catalog.find((entry) => entry.name === name);
    const responsibility = output.responsibilities.find(
      ({ technologyName }) => technologyName === name,
    )?.responsibility;
    return technology && responsibility
      ? [{ ...technology, responsibility }]
      : [];
  });
  const uniqueTechnologies = [
    ...new Map(
      selectedTechnologies.map((technology) => [technology.id, technology]),
    ).values(),
  ];
  if (uniqueTechnologies.length < 4) {
    throw new Error(
      "The model did not return a complete catalog-backed stack.",
    );
  }
  const summaryMarkdown =
    "A small set of clear layers keeps this product simple to build and operate.";

  const recommendation = techStackRecommendationSchema.safeParse({
    headline: output.headline,
    summaryMarkdown,
    technologies: uniqueTechnologies,
    tradeoffMarkdown: output.tradeoffMarkdown,
  });
  if (!recommendation.success) throw recommendation.error;
  return recommendation.data;
}
