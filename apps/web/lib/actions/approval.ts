import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isAction, requiresActionApproval } from "./registry";

const messageSchema = z.object({
  id: z.string(),
  role: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
});

function toolName(part: Record<string, unknown>): string {
  return part.type === "dynamic-tool" && typeof part.toolName === "string"
    ? part.toolName
    : typeof part.type === "string" && part.type.startsWith("tool-")
      ? part.type.slice(5)
      : "";
}

/** Bind client approval responses to the exact server-persisted tool payload. */
export async function validateActionApprovalMessages(
  messages: unknown,
  loadMessage: (id: string) => Promise<unknown>,
): Promise<boolean> {
  if (!Array.isArray(messages)) return false;
  for (const rawMessage of messages) {
    const parsed = messageSchema.safeParse(rawMessage);
    if (!parsed.success) return false;
    const message = parsed.data;
    // Unknown dynamic actions fail closed. Coding tools use static tool-* parts.
    if (
      message.parts.some(
        (part) => part.type === "dynamic-tool" && !isAction(toolName(part)),
      )
    )
      return false;
    const candidates = message.parts.filter(
      (part) => isAction(toolName(part)) || part.state === "approval-responded",
    );
    if (!candidates.length) continue;
    const saved = messageSchema.safeParse(await loadMessage(message.id));
    for (const part of candidates) {
      const original = saved.success
        ? saved.data.parts.find(
            (candidate) => candidate.toolCallId === part.toolCallId,
          )
        : undefined;
      const name = toolName(part);
      const originalName = original ? toolName(original) : "";
      if (
        !requiresActionApproval(name) &&
        !requiresActionApproval(originalName)
      ) {
        if (part.state === "approval-responded" && isAction(name)) return false;
        continue;
      }
      if (
        message.role !== "assistant" ||
        !saved.success ||
        saved.data.role !== "assistant"
      )
        return false;
      if (
        !original ||
        typeof part.toolCallId !== "string" ||
        toolName(original) !== toolName(part) ||
        !isDeepStrictEqual(original.input, part.input)
      )
        return false;
      if (part.state === "approval-responded") {
        if (!requiresActionApproval(name)) return false;
        const approval = z
          .object({
            id: z.string(),
            approved: z.boolean(),
            reason: z.string().optional(),
          })
          .safeParse(part.approval);
        const originalApproval = z
          .object({ id: z.string(), approved: z.boolean().optional() })
          .safeParse(original.approval);
        if (
          !approval.success ||
          !originalApproval.success ||
          approval.data.id !== originalApproval.data.id ||
          (original.state !== "approval-requested" &&
            original.state !== "approval-responded") ||
          (original.state === "approval-responded" &&
            originalApproval.data.approved !== approval.data.approved)
        )
          return false;
      } else if (!isDeepStrictEqual(part, original)) {
        return false;
      }
    }
  }
  return true;
}
