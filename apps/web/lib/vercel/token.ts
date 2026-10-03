import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";

export interface UserVercelAuthInfo {
  token: string;
  expiresAt: number;
  externalId: string;
}

async function getVercelAccessToken(userId: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await db.transaction(async (tx) => {
      // Vercel refresh tokens are single-use. Serialize reads and rotations across
      // server instances, including background workflows with no request headers.
      const [lock] = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${`vercel-token:${userId}`}, 0)) as locked`,
      );
      // Release contending connections immediately so the token owner's auth
      // adapter can acquire a connection to persist the rotated credentials.
      if (!lock?.locked) return null;
      return auth.api.getAccessToken({
        body: { providerId: "vercel", userId },
      });
    });
    if (result) return result;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for Vercel token refresh");
}

async function getVercelAccountId(userId: string): Promise<string> {
  const rows = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "vercel")))
    .limit(1);
  return rows[0]?.accountId ?? "";
}

/**
 * Get a valid Vercel access token plus CLI-relevant metadata for the given user.
 * better-auth auto-refreshes expired tokens via stored refresh token.
 */
export async function getUserVercelAuthInfo(
  userId: string,
): Promise<UserVercelAuthInfo | null> {
  try {
    const [result, externalId] = await Promise.all([
      getVercelAccessToken(userId),
      getVercelAccountId(userId),
    ]);

    if (!result?.accessToken) {
      return null;
    }

    return {
      token: result.accessToken,
      expiresAt: result.accessTokenExpiresAt
        ? Math.floor(new Date(result.accessTokenExpiresAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 3600,
      externalId,
    };
  } catch (error) {
    console.error("Error fetching Vercel auth:", error);
    return null;
  }
}

/**
 * Get a valid Vercel access token for the given user.
 */
export async function getUserVercelToken(
  userId: string,
): Promise<string | null> {
  try {
    const result = await getVercelAccessToken(userId);

    return result?.accessToken ?? null;
  } catch (error) {
    console.error("Error fetching Vercel token:", error);
    return null;
  }
}
