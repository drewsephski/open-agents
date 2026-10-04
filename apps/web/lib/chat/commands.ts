import {
  getLatestUserText,
  parseLeadingInvocation,
} from "./prompt-invocations";
import type { ConversationMessage } from "./prompt-invocations";

export const CHAT_COMMANDS = [
  {
    name: "help",
    description: "Show commands and how to invoke installed skills.",
  },
  {
    name: "plan",
    description: "Inspect the task and make a plan without changing files.",
  },
  {
    name: "review",
    description: "Review the workspace diff or a named area without editing.",
  },
  {
    name: "explain",
    description: "Explain code or behavior with source evidence.",
  },
  {
    name: "pstack",
    description: "Enable pstack engineering mode for this chat.",
  },
  {
    name: "pstack-off",
    description: "Return this chat to the standard workflow.",
  },
] as const;

export function isLocalHelpCommand(
  text: string,
  hasAttachments = false,
): boolean {
  const invocation = parseLeadingInvocation(text);
  return (
    !hasAttachments &&
    invocation?.kind === "command" &&
    invocation.name === "help" &&
    invocation.args === ""
  );
}

export function isReadOnlyCommand(
  messages: readonly ConversationMessage[],
): boolean {
  const invocation = parseLeadingInvocation(getLatestUserText(messages));
  return (
    invocation?.kind === "command" &&
    ["help", "plan", "review", "explain"].includes(invocation.name)
  );
}

export function getCommandGuidance(
  messages: readonly ConversationMessage[],
): string {
  const invocation = parseLeadingInvocation(getLatestUserText(messages));
  if (invocation?.kind !== "command") return "";

  switch (invocation.name) {
    case "help":
      return `# Current command: /help\n\nExplain the app's commands below and that $skill-name invokes an installed skill. Do not call tools, change files, or install anything for this help request.\n${CHAT_COMMANDS.map((command) => `/${command.name}: ${command.description}`).join("\n")}`;
    case "plan":
      return `# Current command: /plan\n\nThis turn is a planning request only, even if the mission or pstack mode normally implements changes. Inspect relevant source with read-only tools, describe the smallest implementation plan, dependencies, risks, and verification. Do not edit files, install dependencies, commit, push, deploy, or start implementation. ${invocation.args ? "The text after /plan is the task to plan." : "Ask what task to plan; do not start exploring without a task."}`;
    case "review":
      return "# Current command: /review\n\nThis turn is a read-only review, even if the mission or pstack mode normally implements changes. Review the named area or, when no arguments are supplied, the current workspace diff. Inspect affected callers as needed. Return prioritized findings with source evidence, concrete impact, and useful fixes. Separate confirmed defects from hypotheses. Do not edit files, install dependencies, commit, push, or deploy. If there are no findings, say so and name any verification limitations.";
    case "explain":
      return `# Current command: /explain\n\nThis turn is a read-only explanation. Trace the requested code or behavior and explain it in plain language using source evidence, separating observed facts from inference. Do not edit files, install dependencies, commit, push, or deploy. ${invocation.args ? "The text after /explain identifies what to explain." : "Ask what to explain; do not explore without a topic."}`;
    default:
      return "";
  }
}
