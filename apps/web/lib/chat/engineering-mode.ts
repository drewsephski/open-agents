import { getUserText } from "./prompt-invocations";
import type { ConversationMessage } from "./prompt-invocations";

export interface EngineeringModeState {
  enabled: boolean;
  commandOnly: boolean;
}

export function resolveEngineeringMode(
  messages: readonly ConversationMessage[],
): EngineeringModeState {
  let enabled = false;
  let commandOnly = false;

  for (const message of messages) {
    if (message.role !== "user") continue;

    const text = getUserText(message);
    const command = /^\/(pstack-off|pstack)(?=\s|$)/i.exec(text);
    commandOnly = false;
    if (!command) continue;

    enabled = command[1]?.toLowerCase() === "pstack";
    commandOnly =
      text.slice(command[0].length).trim().length === 0 &&
      message.parts.every((part) => part.type === "text");
  }

  return { enabled, commandOnly };
}
