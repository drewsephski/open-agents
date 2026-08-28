import { beforeEach, describe, expect, mock, test } from "bun:test";

const generateTextCalls: Array<{
  model: string;
  prompt: string;
  maxOutputTokens: number;
  maxRetries: number;
  timeout: number;
}> = [];
let generationResult: { output: unknown } | Error;

mock.module("@open-agents/agent", () => ({
  model: (modelId: string) => modelId,
}));

mock.module("ai", () => ({
  Output: { object: (value: unknown) => value },
  generateText: async (input: (typeof generateTextCalls)[number]) => {
    generateTextCalls.push(input);
    if (generationResult instanceof Error) throw generationResult;
    return generationResult;
  },
}));

mock.module("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
}));

mock.module("@/lib/botid", () => ({
  checkBotProtection: async () => ({ isBot: false }),
}));

mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: async () => null,
  rateLimitKey: (parts: string[]) => parts.join(":"),
}));

mock.module("@/lib/svgl", () => ({
  getSvglCatalog: async () => [
    {
      id: "439",
      name: "Next.js",
      role: "Framework",
      logo: "https://svgl.app/library/nextjs_icon_dark.svg",
    },
    {
      id: "112",
      name: "TypeScript",
      role: "Language",
      logo: "https://svgl.app/library/typescript.svg",
    },
    {
      id: "180",
      name: "PostgreSQL",
      role: "Database",
      logo: "https://svgl.app/library/postgresql.svg",
    },
    {
      id: "650",
      name: "Stripe",
      role: "Payment",
      logo: "https://svgl.app/library/stripe.svg",
    },
    {
      id: "556",
      name: "Vercel",
      role: "Hosting",
      logo: "https://svgl.app/library/vercel.svg",
    },
  ],
  selectRelevantSvglTechnologies: (catalog: unknown[]) => catalog,
}));

const routeModulePromise = import("./route");

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/recommend-stack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/recommend-stack", () => {
  beforeEach(() => {
    generateTextCalls.length = 0;
    generationResult = {
      output: {
        headline: "A practical commerce stack",
        summaryMarkdown:
          "**Next.js** owns the app while **PostgreSQL** stores its data.",
        technologyNames: [
          "Next.js",
          "TypeScript",
          "PostgreSQL",
          "Stripe",
          "Vercel",
        ],
        tradeoffMarkdown: "This favors delivery speed over portability.",
      },
    };
  });

  test("rejects an underspecified product request", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(createRequest({ request: "A site" }));

    expect(response.status).toBe(400);
    expect(generateTextCalls).toHaveLength(0);
  });

  test("returns a structured recommendation from the supported catalog", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest({ request: "A paid analytics product for agencies" }),
    );
    const body = (await response.json()) as {
      headline: string;
      summaryMarkdown: string;
      technologies: Array<{ name: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.headline).toBe("A practical commerce stack");
    expect(body.summaryMarkdown).toContain("**Next.js**");
    expect(body.technologies.map(({ name }) => name)).toContain("Stripe");
    expect(generateTextCalls[0]?.prompt).toContain(
      "A paid analytics product for agencies",
    );
    expect(generateTextCalls[0]).toMatchObject({
      maxOutputTokens: 480,
      maxRetries: 0,
      timeout: 7000,
    });
    expect(generateTextCalls[0]).toMatchObject({
      model: "openai/gpt-5.6-luna-fast",
    });
  });

  test("completes duplicate-heavy model output locally", async () => {
    generationResult = {
      output: {
        headline: "A repeated stack",
        summaryMarkdown: "The model repeated one choice.",
        technologyNames: ["Next.js", "Next.js"],
        tradeoffMarkdown: "The output is incomplete.",
      },
    };
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest({ request: "A paid analytics product for agencies" }),
    );

    const body = (await response.json()) as {
      technologies: Array<{ name: string }>;
    };
    expect(response.status).toBe(200);
    expect(body.technologies.length).toBeGreaterThanOrEqual(4);
    expect(new Set(body.technologies.map(({ name }) => name)).size).toBe(
      body.technologies.length,
    );
  });

  test("returns a complete local recommendation when generation fails", async () => {
    generationResult = new Error("provider timeout");
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest({ request: "A paid analytics product for agencies" }),
    );
    const body = (await response.json()) as {
      headline: string;
      technologies: Array<{ name: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.headline).toBeTruthy();
    expect(body.technologies.length).toBeGreaterThanOrEqual(4);
    expect(body.technologies.map(({ name }) => name)).toContain("Stripe");
  });
});
