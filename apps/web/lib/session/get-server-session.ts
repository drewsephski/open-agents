import { headers } from "next/headers";
import { cache } from "react";
import { listAccountProviderIds } from "@/lib/auth/account-providers";
import { auth } from "@/lib/auth/config";
import { toAppSession } from "./to-app-session";
import type { Session } from "./types";

export const getServerSession = cache(
  async (): Promise<Session | undefined> => {
    const baSession = await auth.api.getSession({
      headers: await headers(),
    });

    if (!baSession?.user) {
      return undefined;
    }

    const providerIds = await listAccountProviderIds(baSession.user.id);
    return toAppSession(baSession, providerIds);
  },
);
