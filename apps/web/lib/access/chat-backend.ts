import "server-only";
import { getCodexConnection } from "@/lib/codex/credentials";
import type { ExecutionBackend } from "./execution-backend";

export async function getNewChatBackend(
  userId: string,
): Promise<ExecutionBackend> {
  return (await getCodexConnection(userId)).connected
    ? "codex"
    : "launchstack_native";
}
