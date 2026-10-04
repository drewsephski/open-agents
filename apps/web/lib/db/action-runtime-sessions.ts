import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import type {
  ActionProvider,
  ActionExecutionSession,
} from "@/lib/actions/provider";
import {
  actionScopeKey,
  normalizeActionScope,
  type ActionExecutionScope,
} from "@/lib/actions/scope";
import { db } from "./client";
import { actionRuntimeSessions } from "./schema";

/** Never reuse connection-management sessions or a different Chat/policy/account scope. */
export async function ensureActionRuntimeSession(
  context: { userId: string; chatId: string },
  provider: ActionProvider,
  value: ActionExecutionScope,
): Promise<ActionExecutionSession> {
  const scope = normalizeActionScope(value);
  const scopeKey = actionScopeKey(scope);
  const { userId, chatId } = context;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`action-runtime:${provider.id}:${userId}:${chatId}:${scopeKey}`}, 0))`,
    );
    const existing = await tx.query.actionRuntimeSessions.findFirst({
      where: and(
        eq(actionRuntimeSessions.userId, userId),
        eq(actionRuntimeSessions.chatId, chatId),
        eq(actionRuntimeSessions.providerId, provider.id),
        eq(actionRuntimeSessions.scopeKey, scopeKey),
      ),
    });
    if (existing) {
      if (!isDeepStrictEqual(normalizeActionScope(existing.scope), scope))
        throw new Error(
          "Persisted action execution scope does not match the worker",
        );
      return { userId, sessionId: existing.sessionId, scope };
    }
    const sessionId = await provider.createSession(userId, scope);
    await tx.insert(actionRuntimeSessions).values({
      ...context,
      providerId: provider.id,
      scopeKey,
      scope,
      sessionId,
    });
    return { userId, sessionId, scope };
  });
}
