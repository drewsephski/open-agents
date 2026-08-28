import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";

export async function listAccountProviderIds(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return rows.map((row) => row.providerId);
}
