export interface ConversationMessage {
  role: string;
  parts: readonly { type: string; text?: string }[];
}

export interface PromptInvocation {
  kind: "command" | "skill";
  prefix: "/" | "$";
  start: number;
  query: string;
}

export function formatPromptInvocation(
  name: string,
  prefix: "/" | "$",
): string {
  const token =
    prefix === "$" && !/^[a-z][a-z0-9_.:-]*$/i.test(name)
      ? JSON.stringify(name)
      : name;
  return `${prefix}${token}`;
}

export function getUserText(message: ConversationMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

export function getLatestUserText(
  messages: readonly ConversationMessage[],
): string {
  const latestUser = messages.findLast((message) => message.role === "user");
  return latestUser ? getUserText(latestUser) : "";
}

export function extractPromptInvocation(
  text: string,
  cursorPosition: number,
): PromptInvocation | null {
  const beforeCursor = text.slice(0, cursorPosition);
  const match = /^(\s*)([/$])([a-z][a-z0-9_.:-]*|)$/i.exec(beforeCursor);
  if (!match) return null;

  const prefix = match[2] === "$" ? "$" : "/";
  return {
    kind: prefix === "$" ? "skill" : "command",
    prefix,
    start: match[1]?.length ?? 0,
    query: match[3] ?? "",
  };
}

export function parseLeadingInvocation(text: string): {
  kind: "command" | "skill";
  name: string;
  args: string;
} | null {
  const quotedSkill = /^\s*\$("(?:[^"\\]|\\.)*")(?=\s|$)/.exec(text);
  if (quotedSkill?.[1]) {
    try {
      const name: unknown = JSON.parse(quotedSkill[1]);
      if (typeof name !== "string" || !name.trim()) return null;
      return {
        kind: "skill",
        name: name.toLowerCase(),
        args: text.slice(quotedSkill[0].length).trim(),
      };
    } catch {
      return null;
    }
  }
  const match = /^\s*([/$])([a-z][a-z0-9_.:-]*)(?=\s|$)/i.exec(text);
  if (!match?.[2]) return null;
  return {
    kind: match[1] === "$" ? "skill" : "command",
    name: match[2].toLowerCase(),
    args: text.slice(match[0].length).trim(),
  };
}
