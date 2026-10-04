import { expect, test } from "bun:test";
import { SkillInvocationError } from "@/lib/skills/invocation-error";
import { CodexRuntimeError, getCodexErrorMessage } from "./errors";
test("returns known skill and Codex errors while hiding unexpected diagnostics", () => {
  expect(
    getCodexErrorMessage(
      new SkillInvocationError("Skill $missing is not installed."),
    ),
  ).toBe("Skill $missing is not installed.");
  expect(
    getCodexErrorMessage(new CodexRuntimeError("Codex run was stopped.")),
  ).toBe("Codex run was stopped.");
  expect(
    getCodexErrorMessage(new Error("private provider detail")),
  ).not.toContain("private provider detail");
});
