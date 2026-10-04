"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useStacks } from "@/hooks/use-stacks";
import type { StackSummary } from "@/lib/stacks/schema";
import { StackEditor } from "./stack-editor";

export function StacksSection() {
  const { stacks, defaultConfiguration, loading, error, refresh } = useStacks();
  const [editing, setEditing] = useState<StackSummary | "new" | null>(null);
  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading Stacks…
      </p>
    );
  if (error || !defaultConfiguration)
    return (
      <div role="alert" className="space-y-3">
        <p>Could not load Stacks.</p>
        <Button variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Build a Stack, give it work, and launch. Runtime, models, skills,
        connected tools, and delivery travel together.
      </p>
      <div className="rounded-xl border bg-muted/30 p-4">
        <h2 className="font-medium">LaunchStack default</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Uses your current preferences and connected runtime. Every launch
          freezes its configuration.
        </p>
      </div>
      {editing ? (
        <StackEditor
          key={editing === "new" ? "new" : editing.versionId}
          stack={editing === "new" ? undefined : editing}
          initialConfiguration={
            editing === "new" ? defaultConfiguration : editing.configuration
          }
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            await refresh();
            setEditing(null);
          }}
        />
      ) : (
        <Button onClick={() => setEditing("new")}>Build a Stack</Button>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {stacks.map((stack) => (
          <div
            key={stack.id}
            className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <div>
              <h2 className="break-words font-medium">
                {stack.name}{" "}
                <span className="text-xs text-muted-foreground">
                  v{stack.version}
                </span>
              </h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {stack.description}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {stack.configuration.executionBackend === "codex"
                ? "Codex"
                : "LaunchStack Native"}{" "}
              · Vercel · {stack.configuration.globalSkillRefs.length} skills
            </p>
            <Button
              variant="outline"
              className="self-start"
              disabled={editing !== null}
              onClick={() => setEditing(stack)}
            >
              Edit Stack
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
