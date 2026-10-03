import { beforeEach, describe, expect, mock, test } from "bun:test";

let session: { user: { id: string } } | null;
let failure = false;
const recoveredUsers: string[] = [];
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => session,
}));
mock.module("@/lib/billing/billing-runtime", () => ({
  recoverProCheckout: async (userId: string) => {
    recoveredUsers.push(userId);
    if (failure) throw new Error("provider unavailable");
  },
}));
const { POST } = await import("./route");

function request(origin: string | null = "https://launchstack.sh") {
  return new Request("https://launchstack.sh/api/billing/sync", {
    method: "POST",
    headers: origin ? { origin } : {},
    body: JSON.stringify({ userId: "victim", checkoutId: "ch_victim" }),
  });
}

describe("POST /api/billing/sync", () => {
  beforeEach(() => {
    session = { user: { id: "owner" } };
    failure = false;
    recoveredUsers.length = 0;
  });
  test("requires authentication", async () => {
    session = null;
    expect((await POST(request())).status).toBe(401);
    expect(recoveredUsers).toEqual([]);
  });
  test("rejects missing and cross-origin requests", async () => {
    for (const origin of [null, "https://attacker.example"]) {
      expect((await POST(request(origin))).status).toBe(403);
    }
    expect(recoveredUsers).toEqual([]);
  });
  test("uses the session owner and ignores client identity and checkout IDs", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(recoveredUsers).toEqual(["owner"]);
  });
  test("returns a retryable failure without exposing provider details", async () => {
    failure = true;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "billing_sync_unavailable" },
    });
  });
});
