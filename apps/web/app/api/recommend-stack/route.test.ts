import { beforeEach, describe, expect, mock, test } from "bun:test";

const generateTextCalls: Array<{ prompt: string }> = [];
let generationResult: { output: unknown } | Error;

mock.module("@open-agents/agent", () => ({
  defaultLanguageModel: () => "mock-model",
}));

mock.module("ai", () => ({
  Output: { object: (value: unknown) => value },
  generateText: async (input: { prompt: string }) => {
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
        headline: "A practical commerce stack",
        summary: "A typed web application with managed data and payments.",
        technologyIds: [
          "nextjs",
          "typescript",
          "postgresql",
          "stripe",
          "vercel",
        ],
        tradeoff: "This favors speed over infrastructure portability.",
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
      technologyIds: string[];
    };

    expect(response.status).toBe(200);
    expect(body.headline).toBe("A practical commerce stack");
    expect(body.technologyIds).toContain("stripe");
    expect(generateTextCalls[0]?.prompt).toContain(
      "A paid analytics product for agencies",
    );
  });

  test("rejects duplicate-heavy model output", async () => {
    generationResult = {
      output: {
        headline: "A repeated stack",
        summary: "The model repeated several technology choices.",
        technologyIds: ["nextjs", "nextjs", "typescript", "typescript"],
        tradeoff: "The output is incomplete.",
      },
    };
    const { POST } = await routeModulePromise;
    const response = await POST(
      createRequest({ request: "A paid analytics product for agencies" }),
    );

    expect(response.status).toBe(500);
  });
});
