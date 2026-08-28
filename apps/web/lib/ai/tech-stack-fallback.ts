import type { SvglTechnology } from "@/lib/svgl";
import type { TechStackRecommendation } from "@/lib/tech-stack";

const DEFAULT_WEB_STACK = [
  "Next.js",
  "TypeScript",
  "Tailwind CSS",
  "PostgreSQL",
  "Vercel",
] as const;

const requestTechnologyNames: ReadonlyArray<{
  terms: readonly string[];
  names: readonly string[];
}> = [
  { terms: ["mobile", "ios", "android"], names: ["Expo", "TypeScript"] },
  { terms: ["native ios", "iphone"], names: ["Swift"] },
  { terms: ["native android"], names: ["Kotlin"] },
  {
    terms: ["paid", "payment", "billing", "subscription"],
    names: ["Stripe"],
  },
  { terms: ["email", "newsletter"], names: ["Resend"] },
  { terms: ["ai", "llm", "chatbot"], names: ["OpenAI"] },
  { terms: ["realtime", "real-time", "auth"], names: ["Supabase"] },
  { terms: ["cache", "queue"], names: ["Redis"] },
  { terms: ["python"], names: ["Python", "FastAPI"] },
];

function normalizeName(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}

function resolveTechnology(
  technologies: readonly SvglTechnology[],
  requestedName: string,
): SvglTechnology | undefined {
  const normalizedRequestedName = normalizeName(requestedName);
  return technologies.find((technology) => {
    const normalizedTechnologyName = normalizeName(technology.name);
    return (
      normalizedTechnologyName === normalizedRequestedName ||
      normalizedTechnologyName.startsWith(normalizedRequestedName) ||
      normalizedRequestedName.startsWith(normalizedTechnologyName)
    );
  });
}

export function completeTechnologySelection({
  candidates,
  productRequest,
  requestedNames = [],
}: {
  candidates: readonly SvglTechnology[];
  productRequest: string;
  requestedNames?: readonly string[];
}): SvglTechnology[] {
  const request = productRequest.toLowerCase();
  const preferredNames = [
    ...requestedNames,
    ...requestTechnologyNames.flatMap(({ terms, names }) =>
      terms.some((term) => request.includes(term)) ? names : [],
    ),
    ...DEFAULT_WEB_STACK,
  ];
  const selected: SvglTechnology[] = [];

  for (const name of preferredNames) {
    const technology = resolveTechnology(candidates, name);
    if (technology && !selected.some((item) => item.id === technology.id)) {
      selected.push(technology);
    }
    if (selected.length === 6) break;
  }

  for (const technology of candidates) {
    if (!selected.some((item) => item.id === technology.id)) {
      selected.push(technology);
    }
    if (selected.length >= 4) break;
  }

  return selected.slice(0, 8);
}

export function createFallbackTechStack(
  candidates: readonly SvglTechnology[],
  productRequest: string,
  requestedNames: readonly string[] = [],
): TechStackRecommendation {
  const technologies = completeTechnologySelection({
    candidates,
    productRequest,
    requestedNames,
  });
  const names = technologies.map(({ name }) => `**${name}**`);
  const connection = names.length > 1 ? names.join(", ") : "the selected tools";

  return {
    headline: "A focused, production-ready foundation",
    summaryMarkdown: `${connection} form one lean system: the application layer owns the product experience, managed services handle persistent data and infrastructure, and the stack can grow without splitting into premature services.`,
    technologies,
    tradeoffMarkdown:
      "This favors fast delivery and low operational overhead over maximum infrastructure portability.",
  };
}
