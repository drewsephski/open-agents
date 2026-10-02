import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let currentSession: { user: { id: string } } | null = {
  user: { id: "user-1" },
};
let statusResult: Record<string, unknown>;
let replacementResult: Record<string, unknown>;
let replacementError: Error | null = null;
const replacementCalls: Array<{ userId: string; apiKey: string }> = [];
const deletionCalls: string[] = [];

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/credentials/provider-credentials", () => ({
  getOpenRouterCredentialStatus: async (_userId: string) => statusResult,
  replaceOpenRouterCredential: async (userId: string, apiKey: string) => {
    replacementCalls.push({ userId, apiKey });
    if (replacementError) {
      throw replacementError;
    }
    return replacementResult;
  },
  deleteOpenRouterCredential: async (userId: string) => {
    deletionCalls.push(userId);
    return {
      state: "missing",
      label: null,
      lastFour: null,
      validatedAt: null,
    };
  },
}));

const routeModulePromise = import("./route");

function request(method: "GET" | "PUT" | "DELETE", body?: unknown) {
  return new Request(
    "http://localhost/api/settings/provider-credentials/openrouter",
    {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

describe("/api/settings/provider-credentials/openrouter", () => {
  beforeEach(() => {
    currentSession = { user: { id: "user-1" } };
    statusResult = {
      state: "valid",
      label: "Production key",
      lastFour: "1234",
      validatedAt: "2026-08-28T12:00:00.000Z",
      ciphertext: "must-not-be-visible",
    };
    replacementResult = statusResult;
    replacementError = null;
    replacementCalls.length = 0;
    deletionCalls.length = 0;
  });

  test("requires authentication for every lifecycle operation", async () => {
    currentSession = null;
    const { DELETE, GET, PUT } = await routeModulePromise;

    expect((await GET()).status).toBe(401);
    expect(
      (await PUT(request("PUT", { apiKey: "sk-or-v1-secret" }))).status,
    ).toBe(401);
    expect((await DELETE()).status).toBe(401);
    expect(replacementCalls).toHaveLength(0);
    expect(deletionCalls).toHaveLength(0);
  });

  test("GET returns only owner-safe credential status fields", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      credential: {
        state: "valid",
        label: "Production key",
        lastFour: "1234",
        validatedAt: "2026-08-28T12:00:00.000Z",
      },
    });
    expect(JSON.stringify(body)).not.toContain("ciphertext");
  });

  test("PUT writes plaintext once and never returns it", async () => {
    const { PUT } = await routeModulePromise;
    const response = await PUT(
      request("PUT", { apiKey: "sk-or-v1-sensitive-value-1234" }),
    );
    const serializedBody = await response.text();

    expect(response.status).toBe(200);
    expect(replacementCalls).toEqual([
      {
        userId: "user-1",
        apiKey: "sk-or-v1-sensitive-value-1234",
      },
    ]);
    expect(serializedBody).not.toContain("sensitive-value");
    expect(serializedBody).not.toContain("ciphertext");
  });

  test("PUT returns a sanitized state for invalid and revoked keys", async () => {
    const { PUT } = await routeModulePromise;
    replacementResult = {
      state: "revoked",
      label: null,
      lastFour: null,
      validatedAt: null,
    };

    const response = await PUT(
      request("PUT", { apiKey: "revoked-sensitive-value" }),
    );
    const serializedBody = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(serializedBody)).toEqual({
      error: {
        code: "credential_rejected",
        message: "OpenRouter rejected this credential",
      },
      credential: {
        state: "revoked",
        label: null,
        lastFour: null,
        validatedAt: null,
      },
    });
    expect(serializedBody).not.toContain("sensitive-value");
  });

  test("PUT rejects malformed payloads without invoking validation", async () => {
    const { PUT } = await routeModulePromise;
    const response = await PUT(request("PUT", { apiKey: "short" }));

    expect(response.status).toBe(400);
    expect(replacementCalls).toHaveLength(0);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_payload",
        message: "Invalid credential payload",
      },
    });
  });

  test("PUT never serializes or logs thrown secret-bearing errors", async () => {
    const { PUT } = await routeModulePromise;
    replacementError = new Error(
      "provider echoed sk-or-v1-sensitive-value in an internal error",
    );
    const originalConsoleError = console.error;
    const consoleErrorSpy = mock((_message: string) => undefined);
    console.error = consoleErrorSpy;

    try {
      const response = await PUT(
        request("PUT", { apiKey: "sk-or-v1-sensitive-value" }),
      );
      const serializedBody = await response.text();

      expect(response.status).toBe(500);
      expect(serializedBody).not.toContain("sensitive-value");
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
        "sensitive-value",
      );
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("DELETE removes only the authenticated user's credential", async () => {
    const { DELETE } = await routeModulePromise;
    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(deletionCalls).toEqual(["user-1"]);
    expect(await response.json()).toEqual({
      credential: {
        state: "missing",
        label: null,
        lastFour: null,
        validatedAt: null,
      },
    });
  });
});
