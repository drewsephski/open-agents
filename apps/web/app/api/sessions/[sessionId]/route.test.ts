import { expect, mock, test } from "bun:test";

const updates: unknown[] = [];
mock.module("next/server", () => ({ after: () => {} }));
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => ({ user: { id: "owner" } }),
}));
mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => ({
    id: "session-1",
    userId: "owner",
    status: "running",
  }),
  updateSession: async (_id: string, update: unknown) => {
    updates.push(update);
    return { id: "session-1" };
  },
  deleteSession: async () => {},
}));
mock.module("@/lib/sandbox/archive-session", () => ({
  archiveSession: async () => {
    throw new Error("Unexpected archive");
  },
}));
mock.module("@/lib/sandbox/utils", () => ({
  hasRuntimeSandboxState: () => false,
}));
const { PATCH } = await import("./route");

test("Session updates cannot rewrite frozen configuration or authenticated ownership", async () => {
  const response = await PATCH(
    new Request("http://localhost/api/sessions/session-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Rename",
        userId: "other",
        stackVersionId: "forged",
        stackSnapshot: { configuration: { actions: { capabilities: [] } } },
        missionType: "custom",
        globalSkillRefs: [],
        autoCommitPushOverride: true,
      }),
    }),
    { params: Promise.resolve({ sessionId: "session-1" }) },
  );
  expect(response.status).toBe(200);
  expect(updates).toEqual([{ title: "Rename" }]);
});
