import { SkillInvocationError } from "@/lib/skills/invocation-error";

export class CodexRuntimeError extends Error {
  override name = "CodexRuntimeError";
}

export function getCodexErrorMessage(error: unknown): string {
  return error instanceof CodexRuntimeError ||
    error instanceof SkillInvocationError
    ? error.message
    : "Codex could not finish. Reconnect in Connections or try a new workspace.";
}
