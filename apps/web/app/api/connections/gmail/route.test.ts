import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ActionProvider } from "@/lib/actions/provider";

let userId: string | undefined;
let enabled: boolean;
let savedSession: { userId: string; sessionId: string } | undefined;
let status: "connected" | "not_connected";
let fail: boolean;
const ensure = mock(async (id: string, _provider: ActionProvider) => ({
  userId: id,
  sessionId: "trs-owned",
}));
const connect = mock(
  async (
    _session: { userId: string; sessionId: string },
    _callback: string,
  ) => {
    if (fail) throw new Error("private server key");
    return "https://connect.composio.dev/oauth/gmail";
  },
);
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => (userId ? { user: { id: userId } } : undefined),
}));
mock.module("@/lib/db/action-sessions", () => ({
  ensureActionSession: ensure,
  findActionSession: async () => savedSession,
}));
mock.module("@/lib/actions/runtime", () => ({
  getActionProvider: () =>
    enabled
      ? {
          id: "composio",
          connect,
          getConnectionStatus: async () => status,
        }
      : undefined,
}));

const { GET, POST } = await import("./route");
const request = (origin = "https://launchstack.sh") =>
  new Request("https://launchstack.sh/api/connections/gmail", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify({ userId: "attacker", sessionId: "trs-other-user" }),
  });

beforeEach(() => {
  userId = "user-1";
  enabled = true;
  status = "not_connected";
  savedSession = undefined;
  fail = false;
  ensure.mockClear();
  connect.mockClear();
});

describe("Gmail connection API", () => {
  test("requires authentication for status and connect", async () => {
    userId = undefined;
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(ensure).not.toHaveBeenCalled();
  });
  test("rejects cross-origin connect requests", async () => {
    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(ensure).not.toHaveBeenCalled();
  });
  test("reports disabled configuration without creating a session", async () => {
    enabled = false;
    expect(await (await GET()).json()).toEqual({
      enabled: false,
      status: "not_connected",
    });
    expect((await POST(request())).status).toBe(503);
    expect(ensure).not.toHaveBeenCalled();
  });
  test("returns connection status without server session IDs or credentials", async () => {
    status = "connected";
    savedSession = { userId: "user-1", sessionId: "trs-private" };
    const response = await GET();
    expect(await response.json()).toEqual({
      enabled: true,
      status: "connected",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  test("derives user identity and callback on the server, ignoring client IDs", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(ensure.mock.calls[0]?.[0]).toBe("user-1");
    expect(connect.mock.calls[0]).toEqual([
      { userId: "user-1", sessionId: "trs-owned" },
      "https://launchstack.sh/settings/connections",
    ]);
    expect(await response.json()).toEqual({
      redirectUrl: "https://connect.composio.dev/oauth/gmail",
    });
  });
  test("does not expose provider error details", async () => {
    fail = true;
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private server key");
  });
});
