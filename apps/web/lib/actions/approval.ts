import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isMutatingGmailAction } from "./gmail-policy";

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
export async function validateGmailApprovalMessages(
  messages: unknown,
  loadMessage: (id: string) => Promise<unknown>,
): Promise<boolean> {
  if (!Array.isArray(messages)) return false;
  for (const rawMessage of messages) {
    const parsed = messageSchema.safeParse(rawMessage);
    if (!parsed.success) return false;
    const message = parsed.data;
    const mutations = message.parts.filter((part) =>
      isMutatingGmailAction(toolName(part)),
    );
    if (mutations.length === 0) continue;
    if (message.role !== "assistant") return false;
    const saved = messageSchema.safeParse(await loadMessage(message.id));
    if (!saved.success || saved.data.role !== "assistant") return false;
    for (const part of mutations) {
      const original = saved.data.parts.find(
        (candidate) => candidate.toolCallId === part.toolCallId,
      );
      if (
        !original ||
        typeof part.toolCallId !== "string" ||
        toolName(original) !== toolName(part) ||
        !isDeepStrictEqual(original.input, part.input)
      )
        return false;
      if (part.state === "approval-responded") {
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
