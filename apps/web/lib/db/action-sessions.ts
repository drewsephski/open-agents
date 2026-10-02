import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { ActionProvider, ActionSession } from "@/lib/actions/provider";
import { db } from "./client";
import { actionProviderSessions } from "./schema";

export async function findActionSession(
  userId: string,
  providerId: string,
): Promise<ActionSession | undefined> {
  return db.query.actionProviderSessions.findFirst({
    columns: { userId: true, sessionId: true },
    where: and(
      eq(actionProviderSessions.userId, userId),
      eq(actionProviderSessions.providerId, providerId),
    ),
  });
}

export async function ensureActionSession(
  userId: string,
  provider: ActionProvider,
): Promise<ActionSession> {
  return db.transaction(async (tx) => {
    // Serialize first connects across instances without holding a user row lock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`action-session:${provider.id}:${userId}`}, 0))`,
    );
    const existing = await tx.query.actionProviderSessions.findFirst({
      where: and(
        eq(actionProviderSessions.userId, userId),
        eq(actionProviderSessions.providerId, provider.id),
      ),
    });
    if (existing) {
      return { userId, sessionId: existing.sessionId };
    }
    const sessionId = await provider.createSession(userId);
    await tx.insert(actionProviderSessions).values({
      userId,
      providerId: provider.id,
      sessionId,
    });
    return { userId, sessionId };
  });
}
