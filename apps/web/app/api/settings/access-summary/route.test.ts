import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let currentSession: { user: { id: string } } | null = {
  user: { id: "user-1" },
};
const summaryCalls: Array<{ userId: string; modelId: string | undefined }> = [];
const safeSummary = {
  eligible: true,
  inferenceSource: "byok",
  defaultModel: { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash" },
  credential: {
    state: "valid",
    label: "Personal",
    lastFour: "1234",
    validatedAt: "2026-08-28T12:00:00.000Z",
  },
  plan: {
    id: "byok",
    status: null,
    cancelAtPeriodEnd: false,
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    portalAvailable: false,
  },
  managedInference: {
    usedMicros: 0,
    limitMicros: 10_000_000,
    remainingMicros: 10_000_000,
    warning: "none",
    resetAt: null,
  },
  sandbox: {
    tier: "byok",
    usedMilliseconds: 0,
    limitMilliseconds: 7_200_000,
    remainingMilliseconds: 7_200_000,
    runningSandboxCount: 0,
    concurrencyLimit: 1,
    warning: "none",
    resetAt: "2026-09-01T00:00:00.000Z",
  },
};

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/access/access-summary", () => ({
  getAccessSummary: async (
    userId: string,
    _now: Date,
    modelId: string | undefined,
  ) => {
    summaryCalls.push({ userId, modelId });
    return safeSummary;
  },
}));

const routeModulePromise = import("./route");

describe("GET /api/settings/access-summary", () => {
  beforeEach(() => {
    currentSession = { user: { id: "user-1" } };
    summaryCalls.length = 0;
  });

  test("requires authentication before reading access state", async () => {
    currentSession = null;
    const { GET } = await routeModulePromise;
    const response = await GET();
    expect(response.status).toBe(401);
    expect(summaryCalls).toHaveLength(0);
  });

  test("returns only the authenticated user's secret-free summary", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(summaryCalls).toEqual([{ userId: "user-1", modelId: undefined }]);
    expect(JSON.parse(body)).toEqual({ summary: safeSummary });
    expect(body).not.toMatch(/ciphertext|apiKey|envelope|authenticationTag/);
  });

  test("validates and forwards a chat-pinned model id", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request(
        "http://localhost/api/settings/access-summary?modelId=z-ai%2Fglm-5.3-flash",
      ),
    );

    expect(response.status).toBe(200);
    expect(summaryCalls).toEqual([
      { userId: "user-1", modelId: "z-ai/glm-5.3-flash" },
    ]);
  });

  test("rejects an oversized model id before access resolution", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request(
        "http://localhost/api/settings/access-summary?modelId=" +
          "x".repeat(201),
      ),
    );

    expect(response.status).toBe(400);
    expect(summaryCalls).toHaveLength(0);
  });
});
