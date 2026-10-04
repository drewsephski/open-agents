import "server-only";
import { and, eq, sql } from "drizzle-orm";
import {
  actionToolkitSchema,
  type ActionToolkit,
} from "@/lib/actions/registry";
import type { ActionProvider, ActionSession } from "@/lib/actions/provider";
import { db } from "./client";
import { actionProviderSessions } from "./schema";

export async function findActionSession(
  userId: string,
  providerId: string,
  toolkit: ActionToolkit,
): Promise<ActionSession | undefined> {
  actionToolkitSchema.parse(toolkit);
  return db.query.actionProviderSessions.findFirst({
    columns: { userId: true, sessionId: true },
    where: and(
      eq(actionProviderSessions.userId, userId),
      eq(actionProviderSessions.providerId, providerId),
      eq(actionProviderSessions.toolkit, toolkit),
    ),
  });
}

export async function ensureActionSession(
  userId: string,
  provider: ActionProvider,
  toolkit: ActionToolkit,
): Promise<ActionSession> {
  actionToolkitSchema.parse(toolkit);
  return db.transaction(async (tx) => {
    // Serialize first connects across instances without holding a user row lock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`action-session:${provider.id}:${userId}:${toolkit}`}, 0))`,
    );
    const existing = await tx.query.actionProviderSessions.findFirst({
      where: and(
        eq(actionProviderSessions.userId, userId),
        eq(actionProviderSessions.providerId, provider.id),
        eq(actionProviderSessions.toolkit, toolkit),
      ),
    });
    if (existing) {
      return { userId, sessionId: existing.sessionId };
    }
    const sessionId = await provider.createConnectionSession(userId, toolkit);
    await tx.insert(actionProviderSessions).values({
      userId,
      providerId: provider.id,
      toolkit,
      sessionId,
    });
    return { userId, sessionId };
  });
}
