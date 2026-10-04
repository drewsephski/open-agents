import "server-only";

import path from "node:path";
import {
  extractSkillBody,
  substituteArguments,
  injectSkillDirectory,
  type SkillMetadata,
} from "@open-agents/agent/skills";
import type { Sandbox } from "@open-agents/sandbox";
import { SkillInvocationError } from "./invocation-error";
import {
  getLatestUserText,
  parseLeadingInvocation,
  type ConversationMessage,
} from "@/lib/chat/prompt-invocations";

export function getUserSelectedSkill(messages: readonly ConversationMessage[]) {
  const invocation = parseLeadingInvocation(getLatestUserText(messages));
  return invocation?.kind === "skill" ? invocation : null;
}

export async function loadUserSelectedSkill(params: {
  sandbox: Pick<Sandbox, "readFile">;
  skills: readonly SkillMetadata[];
  invocation: NonNullable<ReturnType<typeof getUserSelectedSkill>>;
}): Promise<string> {
  const skill = params.skills.find(
    (candidate) => candidate.name.toLowerCase() === params.invocation.name,
  );
  if (!skill)
    throw new SkillInvocationError(
      `Skill $${params.invocation.name} is not installed in this workspace. Add it in Preferences or choose an installed skill from the $ menu.`,
    );
  if (skill.options.userInvocable === false)
    throw new SkillInvocationError(
      `Skill $${skill.name} does not allow direct user invocation.`,
    );

  let content: string;
  try {
    content = await params.sandbox.readFile(
      path.posix.join(skill.path, skill.filename),
      "utf-8",
    );
  } catch {
    throw new SkillInvocationError(
      `Could not read skill $${skill.name}. Refresh the workspace skills and try again.`,
    );
  }
  const body = substituteArguments(
    extractSkillBody(content),
    params.invocation.args,
  );
  if (!body.trim())
    throw new SkillInvocationError(
      `Skill $${skill.name} has no instructions to load.`,
    );

  return `# Applied user-selected skill: $${skill.name}\n\nThe app loaded this skill at the user's explicit request. Follow its instructions for this task; do not invoke a skill tool to reload it. This does not grant additional tools or bypass action approvals, credential protections, or the user's scope. Referenced resources in the selected skill directory are available as skill context.\n\n${injectSkillDirectory(body, skill.path)}`;
}
