"use client";

import Link from "next/link";
import type { SkillSuggestion } from "@/app/api/sessions/[sessionId]/skills/route";
import { CHAT_COMMANDS } from "@/lib/chat/commands";
import { formatPromptInvocation } from "@/lib/chat/prompt-invocations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ChatCommandHelp({
  open,
  onOpenChange,
  skills,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: SkillSuggestion[] | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Commands and skills</DialogTitle>
          <DialogDescription>
            Start a message with / for commands or $ for installed skills.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3">
          {CHAT_COMMANDS.map((command) => (
            <div
              key={command.name}
              className="grid gap-1 sm:grid-cols-[7rem_1fr]"
            >
              <dt className="font-mono text-sm">/{command.name}</dt>
              <dd className="text-sm text-muted-foreground">
                {command.description}
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-2 border-t pt-4 text-sm">
          <p>
            Use <code>$skill-name</code> followed by your task to load a skill’s
            instructions.
          </p>
          {skills && skills.length > 0 && (
            <p className="break-words font-mono text-xs text-muted-foreground">
              {skills
                .map((skill) => formatPromptInvocation(skill.name, "$"))
                .join(" · ")}
            </p>
          )}
          <Link
            href="/settings/preferences"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Manage installed skills in Preferences
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
