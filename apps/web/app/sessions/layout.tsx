import type { ReactNode } from "react";
import { getLastRepoByUserId } from "@/lib/db/last-repo";
import {
  getArchivedSessionCountByUserId,
  getSessionsWithUnreadByUserId,
} from "@/lib/db/sessions";
import { requireServerSession } from "@/lib/session/require-server-session";
import { SessionsRouteShell } from "./sessions-route-shell";

type SessionsLayoutProps = {
  children: ReactNode;
};

export default async function SessionsLayout({
  children,
}: SessionsLayoutProps) {
  const session = await requireServerSession("/sessions");

  const [lastRepo, sessions, archivedCount] = await Promise.all([
    getLastRepoByUserId(session.user.id),
    getSessionsWithUnreadByUserId(session.user.id, { status: "active" }),
    getArchivedSessionCountByUserId(session.user.id),
  ]);

  return (
    <SessionsRouteShell
      currentUser={session.user}
      initialSessionsData={{ sessions, archivedCount }}
      lastRepo={lastRepo}
    >
      {children}
    </SessionsRouteShell>
  );
}
