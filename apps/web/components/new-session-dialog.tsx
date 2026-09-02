"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SessionStarter } from "@/components/session-starter";
import type { SessionStarterSubmitInput } from "@/components/session-starter-submission";
import { startInitialMessage } from "@/lib/chat/start-initial-message";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastRepo: { owner: string; repo: string } | null;
  createSession: (
    input: Omit<SessionStarterSubmitInput, "initialMessage">,
  ) => Promise<{
    session: { id: string };
    chat: { id: string };
  }>;
}

export function NewSessionDialog({
  open,
  onOpenChange,
  lastRepo,
  createSession,
}: NewSessionDialogProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSession = async (input: SessionStarterSubmitInput) => {
    setIsCreating(true);
    try {
      const { initialMessage, ...sessionInput } = input;
      const { session: createdSession, chat } =
        await createSession(sessionInput);
      await startInitialMessage({
        sessionId: createdSession.id,
        chatId: chat.id,
        text: initialMessage ?? "",
      });
      onOpenChange(false);
      router.push(`/sessions/${createdSession.id}/chats/${chat.id}`);
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-none gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none [&>button]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>New Session</DialogTitle>
          <DialogDescription>
            Choose a repository or start an empty session.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0">
          <SessionStarter
            onSubmit={handleCreateSession}
            isLoading={isCreating}
            lastRepo={lastRepo}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
