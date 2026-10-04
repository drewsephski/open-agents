import { connectSandbox, type SandboxState } from "@open-agents/sandbox";
import type { SkillMetadata } from "@open-agents/agent/skills";
import type { WebAgentUIMessage } from "@/app/types";
import { SkillInvocationError } from "@/lib/skills/invocation-error";
import {
  getUserSelectedSkill,
  loadUserSelectedSkill,
} from "@/lib/skills/user-selected-skill";

export async function loadChatSkillGuidance(params: {
  messages: WebAgentUIMessage[];
  sandboxState: SandboxState;
  skills: SkillMetadata[];
}): Promise<{ ok: true; guidance: string } | { ok: false; error: string }> {
  "use step";
  const invocation = getUserSelectedSkill(params.messages);
  if (!invocation) return { ok: true, guidance: "" };
  const sandbox = await connectSandbox(params.sandboxState);
  try {
    const guidance = await loadUserSelectedSkill({
      sandbox,
      skills: params.skills,
      invocation,
    });
    return { ok: true, guidance };
  } catch (error) {
    if (error instanceof SkillInvocationError)
      return { ok: false, error: error.message };
    throw error;
  }
}
