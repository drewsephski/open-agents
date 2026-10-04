import { ACTION_REGISTRY, isAction } from "./registry";
import { GMAIL_AGENT_INSTRUCTIONS } from "./gmail-instructions";

export function getActionInstructions(names: string[]): string {
  const toolkits = new Set(
    names.filter(isAction).map((name) => ACTION_REGISTRY[name].toolkit),
  );
  return [
    "External actions run in LaunchStack's control plane on the user's connected accounts. Use only the tools provided. Credentials are unavailable in the coding workspace. Never use sandbox commands to bypass an unavailable action. External writes require approval of the complete tool input. Never retry an uncertain write; ask the user to check the connected app first.",
    toolkits.has("gmail") ? GMAIL_AGENT_INSTRUCTIONS : "",
    toolkits.has("linear")
      ? "Linear tools search issues and fetch issue details. Linear access is read-only; issue creation, updates, comments, and arbitrary GraphQL are unavailable."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
