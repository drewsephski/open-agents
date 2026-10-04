import { beforeEach, expect, mock, test } from "bun:test";
import { toUserPreferencesData } from "@/lib/db/user-preferences";
import { buildDefaultStack } from "@/lib/stacks/default-stack";

let auth: { user: { id: string } } | null;
const preferences = toUserPreferencesData();
const configuration = buildDefaultStack(preferences, "launchstack_native");
const create = mock(async (userId: string, input: unknown) => ({
  userId,
  input,
}));
const publish = mock(
  async (
    _userId: string,
    _stackId: string,
    _expectedVersion: number,
    _input: unknown,
  ): Promise<unknown> => undefined,
);
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => auth,
}));
mock.module("@/lib/db/stacks", () => ({
  createStack: create,
  publishStackVersion: publish,
  listStacks: async () => [],
}));
mock.module("@/lib/db/user-preferences", () => ({
  getUserPreferences: async () => preferences,
}));
mock.module("@/lib/access/chat-backend", () => ({
  getNewChatBackend: async () => "launchstack_native",
}));
mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: async () => null,
  rateLimitKey: (parts: string[]) => parts.join(":"),
}));
const { GET, POST } = await import("./route");
const { POST: publishVersion } = await import("./[stackId]/versions/route");

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/stacks", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
const input = { name: "Repair", description: "Fix CI", configuration };

beforeEach(() => {
  auth = { user: { id: "owner" } };
  create.mockClear();
  publish.mockClear();
});

test("authentication and same-origin guards apply to Stack writes", async () => {
  auth = null;
  expect((await GET()).status).toBe(401);
  expect((await POST(request(input))).status).toBe(401);
  auth = { user: { id: "owner" } };
  expect((await POST(request(input, "http://evil.example"))).status).toBe(403);
  expect(
    (
      await publishVersion(
        request({ ...input, expectedVersion: 1 }, "http://evil.example"),
        { params: Promise.resolve({ stackId: "stack-1" }) },
      )
    ).status,
  ).toBe(403);
  expect(create).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

test("creates only validated configurations using authenticated ownership", async () => {
  expect((await POST(request({ ...input, userId: "other" }))).status).toBe(400);
  expect(
    (
      await POST(
        request({
          ...input,
          configuration: {
            ...configuration,
            actions: {
              ...configuration.actions,
              policy: { ...configuration.actions.policy, write: "automatic" },
            },
          },
        }),
      )
    ).status,
  ).toBe(400);
  expect(create).not.toHaveBeenCalled();
  expect((await POST(request(input))).status).toBe(201);
  expect(create.mock.calls[0]?.[0]).toBe("owner");
  const listed = await GET();
  expect((await listed.json()).defaultConfiguration).toMatchObject({
    executionBackend: "launchstack_native",
    sandboxType: "vercel",
  });
});

test("unavailable or stale version publication returns a conflict without claiming success", async () => {
  const response = await publishVersion(
    request({ ...input, expectedVersion: 3 }),
    { params: Promise.resolve({ stackId: "stack-1" }) },
  );
  expect(response.status).toBe(409);
  expect(publish.mock.calls[0]?.slice(0, 3)).toEqual(["owner", "stack-1", 3]);
});
