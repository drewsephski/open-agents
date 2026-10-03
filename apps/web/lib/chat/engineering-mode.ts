export const ENGINEERING_MODE_COMMANDS = [
  {
    name: "pstack",
    description:
      "Enable pstack engineering mode for this chat: investigate, implement, verify.",
  },
  {
    name: "pstack-off",
    description: "Return this chat to the standard workflow.",
  },
] as const;

interface ConversationMessage {
  role: string;
  parts: readonly { type: string; text?: string }[];
}

export interface EngineeringModeState {
  enabled: boolean;
  commandOnly: boolean;
}

function getUserText(message: ConversationMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
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

export function withEngineeringModeCommands<
  T extends { name: string; description: string },
>(skills: readonly T[] | null): { name: string; description: string }[] {
  const commandNames = new Set<string>(
    ENGINEERING_MODE_COMMANDS.map((command) => command.name),
  );
  return [
    ...ENGINEERING_MODE_COMMANDS,
    ...(skills ?? []).filter(
      (skill) => !commandNames.has(skill.name.toLowerCase()),
    ),
  ];
}
