import { describe, expect, mock, test } from "bun:test";
import type { SkillMetadata } from "@open-agents/agent/skills";
mock.module("server-only", () => ({}));
const { getUserSelectedSkill, loadUserSelectedSkill } =
  await import("./user-selected-skill");
const skill: SkillMetadata = {
  name: "review",
  description: "Review code",
  path: "/workspace/.agents/skills/review",
  filename: "SKILL.md",
  options: { disableModelInvocation: true },
};
const user = (text: string) => ({
  role: "user",
  parts: [{ type: "text", text }],
});
const invocation = { kind: "skill" as const, name: "review", args: "checkout" };
describe("explicit skill loading", () => {
  test("loads manually selected skills even when automatic invocation is disabled", async () => {
    const readFile = mock(
      async (_path: string, _encoding: "utf-8") =>
        "---\nname: review\ndescription: Review code\n---\nInspect $ARGUMENTS, then report findings.",
    );
    const guidance = await loadUserSelectedSkill({
      sandbox: { readFile },
      skills: [skill],
      invocation,
    });
    expect(readFile).toHaveBeenCalledWith(`${skill.path}/SKILL.md`, "utf-8");
    expect(guidance).toContain("# Applied user-selected skill: $review");
    expect(guidance).toContain("Inspect checkout, then report findings.");
    expect(guidance).toContain(`Skill directory: ${skill.path}`);
    expect(guidance).toContain("credential protections");
    expect(guidance).not.toContain("description: Review code");
    expect(getUserSelectedSkill([user("/review checkout")])).toBeNull();
    expect(getUserSelectedSkill([user("$REVIEW checkout")])).toEqual(
      invocation,
    );
    expect(
      getUserSelectedSkill([user("$review"), user("Continue")]),
    ).toBeNull();
  });
  test("loads skills with display names containing spaces", async () => {
    const invocation = getUserSelectedSkill([
      user('$"Poteto Mode" fix the bug'),
    ]);
    expect(invocation).not.toBeNull();
    if (!invocation) throw new Error("Expected skill invocation");
    const guidance = await loadUserSelectedSkill({
      sandbox: { readFile: async () => "Investigate $ARGUMENTS." },
      skills: [{ ...skill, name: "Poteto Mode" }],
      invocation,
    });
    expect(guidance).toContain("Investigate fix the bug.");
  });
  test("rejects unknown or user-disabled skills without reading files or installing", async () => {
    const readFile = mock(async () => "instructions");
    await expect(
      loadUserSelectedSkill({ sandbox: { readFile }, skills: [], invocation }),
    ).rejects.toThrow("not installed");
    await expect(
      loadUserSelectedSkill({
        sandbox: { readFile },
        skills: [{ ...skill, options: { userInvocable: false } }],
        invocation,
      }),
    ).rejects.toThrow("does not allow direct user invocation");
    expect(readFile).not.toHaveBeenCalled();
  });
  test("reports unavailable and empty instructions", async () => {
    await expect(
      loadUserSelectedSkill({
        sandbox: {
          readFile: async () => {
            throw new Error("private provider detail");
          },
        },
        skills: [skill],
        invocation,
      }),
    ).rejects.toThrow("Could not read skill $review");
    await expect(
      loadUserSelectedSkill({
        sandbox: {
          readFile: async () =>
            "---\nname: review\ndescription: Review code\n---\n",
        },
        skills: [skill],
        invocation,
      }),
    ).rejects.toThrow("no instructions");
  });
});
