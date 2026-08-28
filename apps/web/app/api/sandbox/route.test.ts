import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("botid/server", () => ({
  checkBotId: async () => ({ isBot: false }),
}));

const provisionCalls: unknown[] = [];
const updateCalls: unknown[][] = [];
let sessionState: Record<string, unknown> = { type: "vercel" };

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => ({
    user: { id: "user-1", username: "nico" },
  }),
}));
mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: async () => null,
  rateLimitKey: (value: unknown) => value,
}));
mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({ ok: true, userId: "user-1" }),
  requireOwnedSession: async () => ({
    ok: true,
    sessionRecord: {
      id: "session-1",
      userId: "user-1",
      sandboxState: sessionState,
      snapshotUrl: null,
    },
  }),
}));
mock.module("@/lib/sandbox/provisioning", () => ({
  provisionSessionSandbox: async (input: unknown) => {
    provisionCalls.push(input);
    return {
      provider: "codesandbox",
      selectionReason: "fallback",
      currentBranch: "main",
    };
  },
}));
mock.module("@/lib/sandbox/connect", () => ({
  connectConfiguredSandbox: async () => ({
    stop: async () => {},
    getState: () => ({
      type: "codesandbox",
      providerSandboxId: "csb-1",
      restore: { kind: "hibernate", sandboxId: "csb-1" },
    }),
  }),
}));
mock.module("@/lib/db/sessions", () => ({
  updateSession: async (...args: unknown[]) => {
    updateCalls.push(args);
  },
}));

const routeModulePromise = import("./route");

describe("/api/sandbox", () => {
  beforeEach(() => {
    provisionCalls.length = 0;
    updateCalls.length = 0;
    sessionState = { type: "vercel" };
  });

  test("delegates creation to the centralized provisioning service", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          sandboxType: "vercel",
        }),
      }),
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.ok).toBe(true);
    expect(provisionCalls).toEqual([
      { sessionId: "session-1", userId: "user-1" },
    ]);
    expect(payload).toMatchObject({
      provider: "codesandbox",
      selectionReason: "fallback",
      currentBranch: "main",
    });
  });

  test("rejects unsupported client sandbox types", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          sandboxType: "invalid",
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(provisionCalls).toHaveLength(0);
  });

  test("requires a session id", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("pause/delete persists the exact provider restore state", async () => {
    sessionState = {
      type: "codesandbox",
      providerSandboxId: "csb-1",
      restore: { kind: "hibernate", sandboxId: "csb-1" },
      expiresAt: Date.now() + 60_000,
    };
    const { DELETE } = await routeModulePromise;
    const response = await DELETE(
      new Request("http://localhost/api/sandbox", {
        method: "DELETE",
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(updateCalls[0]?.[1]).toMatchObject({
      lifecycleState: "hibernated",
      sandboxState: {
        type: "codesandbox",
        providerSandboxId: "csb-1",
        restore: { kind: "hibernate", sandboxId: "csb-1" },
      },
    });
  });
});
