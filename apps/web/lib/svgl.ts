import { z } from "zod";

const SVGL_API_URL = "https://api.svgl.app";

const FALLBACK_SVGL_CATALOG: readonly SvglTechnology[] = [
  [
    "439",
    "Next.js",
    "Framework · Vercel",
    "https://svgl.app/library/nextjs_icon_dark.svg",
  ],
  ["41", "React", "Library", "https://svgl.app/library/react_dark.svg"],
  ["112", "TypeScript", "Language", "https://svgl.app/library/typescript.svg"],
  [
    "77",
    "Tailwind CSS",
    "Framework",
    "https://svgl.app/library/tailwindcss.svg",
  ],
  ["180", "PostgreSQL", "Database", "https://svgl.app/library/postgresql.svg"],
  ["446", "Supabase", "Database", "https://svgl.app/library/supabase.svg"],
  [
    "100",
    "MongoDB",
    "Database",
    "https://svgl.app/library/mongodb-icon-dark.svg",
  ],
  ["183", "Redis", "Database", "https://svgl.app/library/redis.svg"],
  [
    "556",
    "Vercel",
    "Hosting · Vercel",
    "https://svgl.app/library/vercel_dark.svg",
  ],
  ["225", "Cloudflare", "Software", "https://svgl.app/library/cloudflare.svg"],
  ["161", "Expo", "Software", "https://svgl.app/library/expo.svg"],
  ["162", "Flutter", "Framework", "https://svgl.app/library/flutter.svg"],
  ["191", "Swift", "Language", "https://svgl.app/library/swift.svg"],
  ["212", "Python", "Language", "https://svgl.app/library/python.svg"],
  ["275", "FastAPI", "Framework", "https://svgl.app/library/fastapi.svg"],
  [
    "650",
    "Stripe",
    "Software · Payment",
    "https://svgl.app/library/stripe.svg",
  ],
  [
    "450",
    "Resend",
    "Software",
    "https://svgl.app/library/resend-icon-white.svg",
  ],
  ["266", "OpenAI", "AI", "https://svgl.app/library/openai_dark.svg"],
  ["42", "Svelte", "Library", "https://svgl.app/library/svelte.svg"],
  ["43", "Vue", "Framework", "https://svgl.app/library/vue.svg"],
].map(([id, name, role, logo]) => ({ id, name, role, logo }));

const themeRouteSchema = z.object({
  dark: z.url(),
  light: z.url(),
});

const svglEntrySchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  category: z.union([z.string(), z.array(z.string())]),
  route: z.union([z.url(), themeRouteSchema]),
});

export type SvglTechnology = {
  id: string;
  name: string;
  role: string;
  logo: string;
};

const defaultTechnologyNames = new Set(
  [
    "Next.js",
    "React",
    "TypeScript",
    "Tailwind CSS",
    "PostgreSQL",
    "Supabase",
    "Neon",
    "Vercel",
    "Cloudflare",
    "Expo",
    "Stripe",
    "Python",
    "FastAPI",
    "Resend",
    "Better Auth",
    "Clerk",
    "Auth0",
    "MongoDB",
    "Redis",
    "Prisma",
    "Drizzle ORM",
    "Svelte",
    "Vue",
    "Nuxt",
    "Flutter",
    "Swift",
    "Kotlin",
    "OpenAI",
    "Anthropic",
  ].map((name) => name.toLowerCase()),
);

const intentTerms: Record<string, readonly string[]> = {
  mobile: ["expo", "flutter", "swift", "kotlin", "react native"],
  ios: ["expo", "swift", "flutter", "react native"],
  android: ["expo", "kotlin", "flutter", "react native"],
  payment: ["stripe", "paypal", "polar"],
  billing: ["stripe", "paypal", "polar"],
  subscription: ["stripe", "paypal", "polar"],
  auth: ["better auth", "clerk", "auth0", "firebase", "supabase"],
  database: ["postgresql", "mongodb", "supabase", "neon", "redis"],
  analytics: ["posthog", "google analytics", "mixpanel", "tinybird"],
  email: ["resend", "sendgrid", "mailchimp"],
  ai: ["openai", "anthropic", "google gemini", "ollama"],
  deploy: ["vercel", "cloudflare", "netlify", "fly"],
  hosting: ["vercel", "cloudflare", "netlify", "fly"],
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

export function selectRelevantSvglTechnologies(
  catalog: readonly SvglTechnology[],
  productRequest: string,
  limit = 72,
): SvglTechnology[] {
  const request = normalizeSearchText(productRequest);
  const requestedIntentNames = new Set(
    Object.entries(intentTerms)
      .filter(([term]) => request.includes(term))
      .flatMap(([, names]) => names),
  );

  const ranked = catalog
    .map((technology, index) => {
      const name = normalizeSearchText(technology.name);
      const role = normalizeSearchText(technology.role);
      const nameTokens = name.split(" ").filter((token) => token.length > 2);
      const roleTokens = role.split(" ").filter((token) => token.length > 3);
      let score = defaultTechnologyNames.has(name) ? 30 : 0;
      if (request.includes(name)) score += 200;
      if (requestedIntentNames.has(name)) score += 100;
      score +=
        nameTokens.filter((token) => request.includes(token)).length * 20;
      score += roleTokens.filter((token) => request.includes(token)).length * 8;
      return { technology, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: SvglTechnology[] = [];
  const roleCounts = new Map<string, number>();

  for (const score of new Set(ranked.map((item) => item.score))) {
    const group = ranked.filter((item) => item.score === score);
    while (group.length > 0 && selected.length < limit) {
      group.sort((a, b) => {
        const aCount = roleCounts.get(a.technology.role) ?? 0;
        const bCount = roleCounts.get(b.technology.role) ?? 0;
        return aCount - bCount || a.index - b.index;
      });
      const next = group.shift();
      if (!next) break;
      selected.push(next.technology);
      roleCounts.set(
        next.technology.role,
        (roleCounts.get(next.technology.role) ?? 0) + 1,
      );
    }
    if (selected.length >= limit) break;
  }

  return selected;
}

function selectDarkBackgroundLogo(
  route: z.infer<typeof svglEntrySchema>["route"],
): string {
  return typeof route === "string" ? route : route.dark;
}

export async function getSvglCatalog(): Promise<SvglTechnology[]> {
  try {
    const response = await fetch(SVGL_API_URL, {
      next: { revalidate: 60 * 60 },
    });
    if (!response.ok) {
      throw new Error(`SVGL catalog request failed with ${response.status}`);
    }

    const parsedCatalog = z.array(svglEntrySchema).parse(await response.json());
    return parsedCatalog.map((entry) => ({
      id: String(entry.id),
      name: entry.title,
      role: Array.isArray(entry.category)
        ? entry.category.join(" · ")
        : entry.category,
      logo: selectDarkBackgroundLogo(entry.route),
    }));
  } catch (error) {
    console.warn("[svgl] Using the bundled catalog fallback:", error);
    return [...FALLBACK_SVGL_CATALOG];
  }
}
