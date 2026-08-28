import type { NextRequest } from "next/server";
import { listAccountProviderIds } from "@/lib/auth/account-providers";
import { auth } from "@/lib/auth/config";
import { toAppSession } from "./to-app-session";
import type { Session } from "./types";

export async function getSessionFromReq(
  req: NextRequest,
): Promise<Session | undefined> {
  const baSession = await auth.api.getSession({
    headers: req.headers,
  });

  if (!baSession?.user) {
    return undefined;
  }

  const providerIds = await listAccountProviderIds(baSession.user.id);
  return toAppSession(baSession, providerIds);
}
