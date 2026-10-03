import { beforeEach, expect, mock, test } from "bun:test";

let session: { user: { id: string } } | null = { user: { id: "owner" } };
const saves: { userId: string; authFile: string }[] = [];
const deletions: string[] = [];
let saveError: Error | null = null;
const authFile = JSON.stringify({
  tokens: {
    id_token: "identity-secret",
    access_token: "access-secret",
    refresh_token: "refresh-secret",
    account_id: "account",
  },
});
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => session,
}));
mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: async () => null,
  rateLimitKey: (values: string[]) => values.join(":"),
}));
mock.module("@/lib/codex/credentials", () => ({
  getCodexConnection: async () => ({
    connected: true,
    ciphertext: "private-envelope",
  }),
  saveCodexConnection: async (userId: string, value: string) => {
    saves.push({ userId, authFile: value });
    if (saveError) throw saveError;
    return { connected: true };
  },
  deleteCodexConnection: async (userId: string) => {
    deletions.push(userId);
    return { connected: false };
  },
}));
const { GET, PUT, DELETE } = await import("./route");
const request = (method: string, body?: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/settings/provider-credentials/codex", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  session = { user: { id: "owner" } };
  saves.length = 0;
  deletions.length = 0;
  saveError = null;
});

test("all credential operations require an authenticated owner", async () => {
  session = null;
  expect((await GET()).status).toBe(401);
  expect((await PUT(request("PUT", { authFile }))).status).toBe(401);
  expect((await DELETE(request("DELETE"))).status).toBe(401);
  expect(saves).toHaveLength(0);
  expect(deletions).toHaveLength(0);
});
test("cross-origin writes are rejected before reading or saving auth", async () => {
  expect(
    (await PUT(request("PUT", { authFile }, "https://attacker.example")))
      .status,
  ).toBe(403);
  expect(
    (await DELETE(request("DELETE", undefined, "https://attacker.example")))
      .status,
  ).toBe(403);
  expect(saves).toHaveLength(0);
  expect(deletions).toHaveLength(0);
});
test("status and save return only connection state, bound to the signed-in owner", async () => {
  expect(await (await GET()).json()).toEqual({
    connection: { connected: true },
  });
  const response = await PUT(request("PUT", { authFile, userId: "victim" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ connection: { connected: true } });
  expect(saves).toEqual([{ userId: "owner", authFile }]);
  expect(await (await DELETE(request("DELETE"))).json()).toEqual({
    connection: { connected: false },
  });
  expect(deletions).toEqual(["owner"]);
});
test("API-key auth and oversized files never reach storage", async () => {
  expect(
    (
      await PUT(
        request("PUT", {
          authFile: JSON.stringify({ OPENAI_API_KEY: "fixture-key" }),
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await PUT(request("PUT", { authFile: "x".repeat(100001) }))).status,
  ).toBe(413);
  expect(saves).toHaveLength(0);
});
test("secret-bearing storage errors are never returned", async () => {
  saveError = new Error("private access-secret diagnostic");
  const response = await PUT(request("PUT", { authFile }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("access-secret");
});
