import "server-only";
import { and, eq, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { codexRunLeases } from "@/lib/db/schema";

type LeaseDatabase = Pick<typeof db, "insert" | "delete">;
export function createCodexRunLeaseStore(database: LeaseDatabase = db) {
  return {
    async acquire(userId: string, runId: string, now = new Date()) {
      const expiresAt = new Date(now.getTime() + 12 * 60 * 1000);
      const [lease] = await database
        .insert(codexRunLeases)
        .values({ userId, runId, expiresAt })
        .onConflictDoUpdate({
          target: codexRunLeases.userId,
          set: { runId, expiresAt },
          setWhere: or(
            eq(codexRunLeases.runId, runId),
            lte(codexRunLeases.expiresAt, now),
          ),
        })
        .returning();
      return Boolean(lease);
    },
    async release(userId: string, runId: string) {
      await database
        .delete(codexRunLeases)
        .where(
          and(
            eq(codexRunLeases.userId, userId),
            eq(codexRunLeases.runId, runId),
          ),
        );
    },
  };
}
export const codexRunLeaseStore = createCodexRunLeaseStore();
