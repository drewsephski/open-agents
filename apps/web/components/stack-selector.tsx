"use client";
import Link from "next/link";
import type { StackSummary } from "@/lib/stacks/schema";
import { DEFAULT_STACK_ID } from "@/lib/stacks/schema";

export function StackSelector({
  value,
  stacks,
  disabled,
  error,
  onChange,
}: {
  value: string;
  stacks: StackSummary[];
  disabled?: boolean;
  error?: boolean;
  onChange: (versionId: string) => void;
}) {
  return (
    <div className="shrink-0 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="session-stack" className="text-sm font-medium">
          Stack
        </label>
        <Link
          href="/settings/stacks"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          Manage Stacks
        </Link>
      </div>
      <select
        id="session-stack"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value={DEFAULT_STACK_ID}>
          LaunchStack default · current preferences
        </option>
        {stacks.map((stack) => (
          <option key={stack.versionId} value={stack.versionId}>
            {stack.name} · v{stack.version}
          </option>
        ))}
      </select>
      {error && (
        <p role="status" className="text-xs text-destructive">
          Could not load saved Stacks. The default is still available.
        </p>
      )}
    </div>
  );
}
