import "server-only";
import { and, eq } from "drizzle-orm";
import type {
  ActionExecutionKey,
  ActionExecutionStore,
} from "@/lib/actions/execution";
import { db } from "./client";
import { actionExecutions } from "./schema";

function scope(key: ActionExecutionKey) {
  return and(
    eq(actionExecutions.userId, key.userId),
    eq(actionExecutions.chatId, key.chatId),
    eq(actionExecutions.toolCallId, key.toolCallId),
  );
}

export const actionExecutionStore: ActionExecutionStore = {
  async claim(execution) {
    const rows = await db
      .insert(actionExecutions)
      .values(execution)
      .onConflictDoNothing()
      .returning({ toolCallId: actionExecutions.toolCallId });
    return rows.length === 1;
  },
  async get(key) {
    return db.query.actionExecutions.findFirst({ where: scope(key) });
  },
  async complete(key, output) {
    await db
      .update(actionExecutions)
      .set({ status: "completed", output })
      .where(scope(key));
  },
};
