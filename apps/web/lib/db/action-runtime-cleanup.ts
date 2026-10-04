import "server-only";
import { eq, inArray } from "drizzle-orm";
import { createComposioActionProvider } from "@/lib/actions/composio";
import { db } from "./client";
import { actionRuntimeSessions, chats } from "./schema";

/** Bounded best effort. Credentials and connection-management sessions are untouched. */
export async function prepareActionRuntimeCleanup(
  context: { chatId: string } | { sessionId: string },
): Promise<() => Promise<void>> {
  try {
    const filter =
      "chatId" in context
        ? eq(actionRuntimeSessions.chatId, context.chatId)
        : inArray(
            actionRuntimeSessions.chatId,
            db
              .select({ id: chats.id })
              .from(chats)
              .where(eq(chats.sessionId, context.sessionId)),
          );
    const rows = await db
      .select()
      .from(actionRuntimeSessions)
      .where(filter)
      .limit(50);
    const key = process.env.COMPOSIO_API_KEY;
    if (!key || rows.length === 0) return async () => {};
    const provider = createComposioActionProvider(key);
    return async () => {
      // Sequential batches limit concurrent remote work; each request has a strict timeout.
      for (let offset = 0; offset < rows.length; offset += 5) {
        await Promise.all(
          rows.slice(offset, offset + 5).map(async (row) => {
            try {
              await provider.deleteSession(row.sessionId);
              // Keep scope evidence on archive, especially for legacy Chats. A 404
              // on resume recreates only this same scope. Chat deletion cascades rows.
            } catch {
              console.warn(
                "Unable to remove an external Action runtime; worker authorization remains blocked locally.",
              );
            }
          }),
        );
      }
    };
  } catch {
    console.warn("Unable to prepare external Action runtime cleanup.");
    return async () => {};
  }
}

export async function cleanupActionRuntimes(
  context: { chatId: string } | { sessionId: string },
): Promise<void> {
  const cleanup = await prepareActionRuntimeCleanup(context);
  await cleanup();
}
