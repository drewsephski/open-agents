import { beforeEach, expect, mock, test } from "bun:test";
import { buildDefaultStack } from "@/lib/stacks/default-stack";
import { toUserPreferencesData } from "@/lib/db/user-preferences";
mock.module("server-only", () => ({}));
let userId: string | undefined;
const observed: Array<Record<string, unknown>> = [];
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => (userId ? { user: { id: userId } } : null),
}));
mock.module("@/lib/db/stacks", () => ({
  getOwnedStackVersion: async (owner: string, id: string) =>
    owner === "owner" && id === "version-1"
      ? {
          name: "Reader",
          version: 1,
          configuration: buildDefaultStack(
            toUserPreferencesData(),
            "launchstack_native",
          ),
        }
      : undefined,
}));
mock.module("@/lib/stacks/launch-readiness", () => ({
  getLaunchReadiness: async (input: Record<string, unknown>) => {
    observed.push(input);
    return {
      ready: false,
      blockers: [
        {
          code: "connection_required",
          toolkit: "gmail",
          label: "Connect Gmail",
          remediation: "/settings/connections",
        },
      ],
      bindings: {},
      requirements: [],
    };
  },
}));
const { POST } = await import("./route");
const request = (body: unknown) =>
  new Request("https://launchstack.sh/api/stacks/readiness", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  userId = "owner";
  observed.length = 0;
});
test("readiness requires an authenticated User and an owned immutable Stack version", async () => {
  userId = undefined;
  expect((await POST(request({ stackVersionId: "version-1" }))).status).toBe(
    401,
  );
  userId = "other";
  expect((await POST(request({ stackVersionId: "version-1" }))).status).toBe(
    404,
  );
  expect(observed).toEqual([]);
});
test("readiness resolves exact account selections and launch overrides on the server", async () => {
  const response = await POST(
    request({
      stackVersionId: "version-1",
      actionAccountIds: { gmail: "ca-chosen" },
      repository: { owner: "acme", repo: "repo" },
      autoCommitPush: false,
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(observed[0]).toMatchObject({
    userId: "owner",
    accountIds: { gmail: "ca-chosen" },
    repository: { owner: "acme", repo: "repo" },
    configuration: { autoCommitPush: false },
  });
});
test("unknown toolkits and client-supplied authority fail request validation", async () => {
  expect(
    (
      await POST(
        request({
          stackVersionId: "version-1",
          actionAccountIds: { slack: "ca-1" },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          stackVersionId: "version-1",
          userId: "other",
          configuration: {},
        }),
      )
    ).status,
  ).toBe(400);
  expect(observed).toEqual([]);
});
