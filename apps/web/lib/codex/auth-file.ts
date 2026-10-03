import { z } from "zod";

// Only subscription auth is accepted. Never fall back to separately billed API auth.
export const codexAuthFileSchema = z.object({
  auth_mode: z.literal("chatgpt").optional(),
  OPENAI_API_KEY: z.null().optional(),
  tokens: z.object({
    id_token: z.string().min(1).max(16000),
    access_token: z.string().min(1).max(16000),
    refresh_token: z.string().min(1).max(16000),
    account_id: z.string().min(1).max(512),
  }),
  last_refresh: z.string().max(100).optional(),
});

export function parseCodexAuthFile(value: string): string {
  if (Buffer.byteLength(value, "utf8") > 65536)
    throw new Error("Invalid Codex login file");
  try {
    return JSON.stringify(codexAuthFileSchema.parse(JSON.parse(value)));
  } catch {
    throw new Error("Invalid Codex login file. Reconnect in Connections.");
  }
}
