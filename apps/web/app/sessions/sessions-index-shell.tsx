"use client";

import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSessionsShell } from "./sessions-shell-context";

export function SessionsIndexShell() {
  const { openNewSessionDialog } = useSessionsShell();

  return (
    <>
      <header className="px-3 py-2 lg:px-4 lg:py-3">
        <div className="flex min-h-8 items-center gap-2">
          <SidebarTrigger className="shrink-0" />
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquare />
            </EmptyMedia>
            <EmptyTitle>Select a session</EmptyTitle>
            <EmptyDescription>
              Pick one from the sidebar, or start a new session.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openNewSessionDialog}>
              <Plus className="h-4 w-4" />
              New Session
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}
