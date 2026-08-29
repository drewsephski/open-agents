import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const updates: unknown[] = [];
const events: string[] = [];
mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => ({
    id: "session-1",
    sandboxState: {
      type: "vercel",
      sandboxName: "session_session-1",
      expiresAt: Date.now() + 60_000,
    },
  }),
  updateSession: async (_sessionId: string, patch: unknown) => {
    updates.push(patch);
  },
}));
mock.module("./allowance", () => ({
  releaseSandboxRunning: async () => {
    events.push("release");
  },
}));
mock.module("./connect", () => ({
  connectConfiguredSandbox: async () => ({
    stop: async () => {
      events.push("stop");
    },
    getState: () => ({
      type: "vercel",
      sandboxName: "session_session-1",
    }),
  }),
}));
mock.module("./lifecycle", () => ({
  buildHibernatedLifecycleUpdate: () => ({
    lifecycleState: "hibernated",
    sandboxExpiresAt: null,
    hibernateAfter: null,
    lifecycleRunId: null,
    lifecycleError: null,
  }),
}));

const { hibernateSandboxAfterAllowanceDenial } =
  await import("./allowance-hibernation");

describe("hibernateSandboxAfterAllowanceDenial", () => {
  test("stops the provider before releasing metering and preserves restore state", async () => {
    await hibernateSandboxAfterAllowanceDenial("session-1");

    expect(events).toEqual(["stop", "release"]);
    expect(updates).toEqual([
      expect.objectContaining({
        lifecycleState: "hibernated",
        sandboxState: expect.objectContaining({
          type: "vercel",
          sandboxName: "session_session-1",
          restore: {
            kind: "named",
            sandboxName: "session_session-1",
          },
        }),
      }),
    ]);
  });
});
