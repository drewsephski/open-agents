import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { OpenRouterCatalogModel } from "@open-agents/agent/model-catalog";

const catalogModels: OpenRouterCatalogModel[] = [];
const requestedUrls: string[] = [];

let modelsDevApiData: unknown = {};
let currentSession: {
  authProvider?: "vercel" | "github";
  user: { id: string; email?: string; username?: string; avatar?: string };
} | null = null;

const originalFetch = globalThis.fetch;

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

mock.module("server-only", () => ({}));

mock.module("@open-agents/agent/model-catalog", () => ({
  fetchOpenRouterLanguageModels: async () => catalogModels,
}));

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

const routeModulePromise = import("./route");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("/api/models context window enrichment", () => {
  beforeEach(() => {
    catalogModels.length = 0;
    requestedUrls.length = 0;
    modelsDevApiData = {};
    currentSession = null;

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      requestedUrls.push(getRequestUrl(input));
      return Promise.resolve(
        new Response(JSON.stringify(modelsDevApiData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch;
  });

  test("overrides OpenRouter context windows from models.dev", async () => {
    catalogModels.push(
      {
        id: "openai/gpt-5.3-codex",
        name: "GPT 5.3 Codex",
        modelType: "language",
        context_window: 200_000,
      },
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        modelType: "language",
        context_window: 200_000,
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o mini",
        modelType: "language",
        context_window: 128_000,
      },
      {
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash",
        modelType: "language",
        context_window: 128_000,
      },
    );

    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5.3-codex": {
            limit: { context: 400_000 },
          },
        },
      },
      anthropic: {
        models: {
          "claude-opus-4.6": {
            limit: { context: 1_000_000 },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };
    const contextById = new Map(
      body.models.map((model) => [model.id, model.context_window]),
    );

    expect(contextById.get("openai/gpt-5.3-codex")).toBe(400_000);
    expect(contextById.get("anthropic/claude-opus-4.6")).toBe(1_000_000);
    expect(contextById.get("openai/gpt-4o-mini")).toBe(128_000);
    expect(contextById.get("z-ai/glm-5.3-flash")).toBe(128_000);
    expect(requestedUrls).toContain("https://models.dev/api.json");
  });

  test("hides Claude Opus models for managed trial users", async () => {
    catalogModels.push(
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        modelType: "language",
      },
      {
        id: "anthropic/claude-haiku-4.5",
        name: "Claude Haiku 4.5",
        modelType: "language",
      },
    );
    currentSession = {
      authProvider: "vercel",
      user: { id: "user-1", email: "person@example.com" },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("https://open-agents.dev/api/models"),
    );
    const body = (await response.json()) as {
      models: Array<{ id: string }>;
    };

    expect(body.models.map((model) => model.id)).toEqual([
      "anthropic/claude-haiku-4.5",
    ]);
  });

  test("keeps OpenRouter context window when models.dev only has related ids", async () => {
    catalogModels.push({
      id: "openai/gpt-5.3-codex-2026-02-15",
      name: "GPT 5.3 Codex dated",
      modelType: "language",
      context_window: 200_000,
    });

    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5": {
            limit: { context: 272_000 },
          },
          "gpt-5.3-codex": {
            limit: { context: 400_000 },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };

    expect(body.models).toHaveLength(1);
    expect(body.models[0]?.context_window).toBe(200_000);
  });

  test("keeps valid models.dev metadata when sibling fields are invalid", async () => {
    catalogModels.push({
      id: "openai/gpt-5.3-codex",
      name: "GPT 5.3 Codex",
      modelType: "language",
      context_window: 200_000,
    });

    modelsDevApiData = {
      invalidProvider: "bad",
      openai: {
        models: {
          "gpt-5.3-codex": {
            limit: { context: "400_000" },
            cost: {
              input: 1.25,
              output: 10,
              context_over_200k: {
                input: 2.5,
              },
            },
          },
          broken: {
            limit: { context: "not-a-number" },
            cost: { input: "expensive" },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{
        id: string;
        context_window?: number;
        cost?: {
          input?: number;
          output?: number;
          context_over_200k?: {
            input?: number;
          };
        };
      }>;
    };

    expect(body.models).toHaveLength(1);
    expect(body.models[0]).toMatchObject({
      id: "openai/gpt-5.3-codex",
      context_window: 200_000,
      cost: {
        input: 1.25,
        output: 10,
        context_over_200k: {
          input: 2.5,
        },
      },
    });
  });

  test("returns the OpenRouter language catalog without Gateway recovery paths", async () => {
    catalogModels.push({
      id: "z-ai/glm-5.3-flash",
      name: "GLM 5.3 Flash",
      description: "Default Launchstack model",
      modelType: "language",
    });

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{
        id: string;
        name: string;
        description?: string | null;
        modelType?: string;
      }>;
    };

    expect(body.models).toEqual([
      {
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash",
        description: "Default Launchstack model",
        modelType: "language",
      },
    ]);
  });
});
