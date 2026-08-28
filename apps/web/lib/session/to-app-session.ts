import type { Session } from "./types";
import {
  hasVercelProvider,
  resolveAuthProvider,
} from "@/lib/auth/resolve-provider";

interface BetterAuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  username?: unknown;
}

interface BetterAuthSession {
  session: {
    createdAt: Date;
  };
  user: BetterAuthUser;
}

function extractUsername(user: BetterAuthUser): string {
  if (typeof user.username === "string" && user.username) {
    return user.username;
  }

  return user.name ?? "";
}

export function toAppSession(
  baSession: BetterAuthSession,
  providerIds: readonly string[],
): Session {
  return {
    created: baSession.session.createdAt.getTime(),
    authProvider: resolveAuthProvider(providerIds),
    hasVercelAccount: hasVercelProvider(providerIds),
    user: {
      id: baSession.user.id,
      username: extractUsername(baSession.user),
      email: baSession.user.email ?? undefined,
      avatar: baSession.user.image ?? "",
      name: baSession.user.name ?? undefined,
    },
  };
}
