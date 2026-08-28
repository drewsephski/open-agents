import { beforeEach, describe, expect, mock, test } from "bun:test";

const generateTextCalls: Array<{
  prompt: string;
  maxOutputTokens: number;
  maxRetries: number;
  timeout: number;
}> = [];
let generationResult: { output: unknown } | Error;

mock.module("@open-agents/agent", () => ({
  defaultLanguageModel: () => "mock-model",
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
        technologyIds: [
          "nextjs",
          "typescript",
          "postgresql",
          "stripe",
          "vercel",
        ],
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
      summary: string;
      technologyIds: string[];
    };

    expect(response.status).toBe(200);
    expect(body.headline).toBe("A focused full-stack foundation");
    expect(body.summary).toContain("Next.js, TypeScript, PostgreSQL");
    expect(body.technologyIds).toContain("stripe");
    expect(generateTextCalls[0]?.prompt).toContain(
      "A paid analytics product for agencies",
    );
    expect(generateTextCalls[0]).toMatchObject({
      maxOutputTokens: 100,
      maxRetries: 0,
      timeout: 8000,
    });
  });

  test("rejects duplicate-heavy model output", async () => {
    generationResult = {
      output: {
        technologyIds: ["nextjs", "nextjs"],
      },
    };
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest({ request: "A paid analytics product for agencies" }),
    );

    expect(response.status).toBe(500);
  });
});
