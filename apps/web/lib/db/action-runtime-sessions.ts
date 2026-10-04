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

/** Only persisted execution evidence can bind a legacy Chat. Never consult current accounts. */
export async function findLegacyActionScope(context: {
  userId: string;
  chatId: string;
}): Promise<ActionExecutionScope | undefined> {
  const rows = await db.query.actionRuntimeSessions.findMany({
    where: and(
      eq(actionRuntimeSessions.userId, context.userId),
      eq(actionRuntimeSessions.chatId, context.chatId),
      eq(actionRuntimeSessions.providerId, "composio"),
    ),
    limit: 2,
  });
  if (rows.length !== 1) return undefined;
  return normalizeActionScope(rows[0]!.scope);
}

/** A confirmed missing remote runtime can be replaced without changing its scope. */
export async function invalidateActionRuntimeSession(
  context: { userId: string; chatId: string },
  session: ActionExecutionSession,
): Promise<void> {
  await db
    .delete(actionRuntimeSessions)
    .where(
      and(
        eq(actionRuntimeSessions.userId, context.userId),
        eq(actionRuntimeSessions.chatId, context.chatId),
        eq(actionRuntimeSessions.scopeKey, actionScopeKey(session.scope)),
        eq(actionRuntimeSessions.sessionId, session.sessionId),
      ),
    );
}

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
