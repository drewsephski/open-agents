import { beforeEach, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const readFile = mock(async () => "Review $ARGUMENTS.");
const connectSandbox = mock(async () => ({ readFile }));
mock.module("@open-agents/sandbox", () => ({ connectSandbox }));
const { loadChatSkillGuidance } = await import("./chat-skill-guidance");
const params = {
  sandboxState: { type: "vercel" as const },
  skills: [
    {
      name: "review",
      description: "Review code",
      path: "/workspace/.agents/skills/review",
      filename: "SKILL.md",
      options: { disableModelInvocation: true },
    },
  ],
};
const messages = (text: string) => [
  {
    id: "user",
    role: "user" as const,
    parts: [{ type: "text" as const, text }],
  },
];
beforeEach(() => {
  readFile.mockClear();
  connectSandbox.mockClear();
});
test("does not connect to a sandbox for app commands or ordinary text", async () => {
  for (const text of ["/review", "Explain checkout"])
    expect(
      await loadChatSkillGuidance({ ...params, messages: messages(text) }),
    ).toEqual({ ok: true, guidance: "" });
  expect(connectSandbox).not.toHaveBeenCalled();
});
test("loads explicit skill instructions and returns a serializable result", async () => {
  const result = await loadChatSkillGuidance({
    ...params,
    messages: messages("$review checkout"),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected selected skill guidance");
  expect(result.guidance).toContain("Review checkout.");
  expect(connectSandbox).toHaveBeenCalledTimes(1);
  expect(readFile).toHaveBeenCalledTimes(1);
});
test("returns expected errors safely across the workflow boundary", async () => {
  const result = await loadChatSkillGuidance({
    ...params,
    messages: messages("$missing"),
  });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected invocation error");
  expect(result.error).toContain("Skill $missing is not installed");
  expect(readFile).not.toHaveBeenCalled();
});
