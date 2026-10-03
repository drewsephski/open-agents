import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getChatSummariesBySessionId } from "@/lib/db/sessions";
import { getSessionByIdCached } from "@/lib/db/sessions-cache";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { sanitizeUserPreferencesForSession } from "@/lib/model-access";
import { requireServerSession } from "@/lib/session/require-server-session";
import { SessionLayoutShell } from "./session-layout-shell";

interface SessionLayoutProps {
  params: Promise<{ sessionId: string }>;
  children: ReactNode;
}

export default async function SessionLayout({
  params,
  children,
}: SessionLayoutProps) {
  const { sessionId } = await params;

  const session = await requireServerSession(`/sessions/${sessionId}`);
  const sessionRecord = await getSessionByIdCached(sessionId);
  if (!sessionRecord) {
    notFound();
  }

  if (sessionRecord.userId !== session.user.id) {
    redirect("/");
  }

  let initialChatsData:
    | {
        chats: Awaited<ReturnType<typeof getChatSummariesBySessionId>>;
        defaultModelId: string | null;
      }
    | undefined;

  try {
    const requestHost = (await headers()).get("host") ?? "";
    const [chats, rawPreferences] = await Promise.all([
      getChatSummariesBySessionId(sessionId, session.user.id),
      getUserPreferences(session.user.id),
    ]);
    const preferences = sanitizeUserPreferencesForSession(
      rawPreferences,
      session,
      requestHost,
    );
    initialChatsData = {
      chats,
      defaultModelId: preferences.defaultModelId,
    };
  } catch (error) {
    console.error("Failed to prefetch session chat data:", error);
  }

  return (
    <SessionLayoutShell
      session={sessionRecord}
      initialChatsData={initialChatsData}
    >
      {children}
    </SessionLayoutShell>
  );
}
