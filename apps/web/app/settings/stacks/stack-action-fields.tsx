"use client";

import type { StackActions } from "@/lib/stacks/schema";

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function StackActionFields({
  actions,
  onChange,
}: {
  actions: StackActions;
  onChange: (actions: StackActions) => void;
}) {
  return (
    <>
      <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
        Gmail capabilities
        <select
          className={selectClass}
          value={
            actions.capabilities.find((item) => item.toolkit === "gmail")
              ?.access ?? "none"
          }
          onChange={(event) =>
            onChange({
              ...actions,
              capabilities: [
                ...actions.capabilities.filter(
                  (item) => item.toolkit !== "gmail",
                ),
                ...(event.target.value === "none"
                  ? []
                  : [
                      {
                        toolkit: "gmail",
                        access:
                          event.target.value === "read" ? "read" : "read_write",
                      } as const,
                    ]),
              ],
            })
          }
        >
          <option value="none">Disabled</option>
          <option value="read">Read only</option>
          <option value="read_write">Read, draft, and send</option>
        </select>
        <span className="text-xs font-normal text-muted-foreground">
          Requires your Gmail connection at runtime. Every draft and send
          requires approval.
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
        Linear capabilities
        <select
          className={selectClass}
          value={
            actions.capabilities.some((item) => item.toolkit === "linear")
              ? "read"
              : "none"
          }
          onChange={(event) =>
            onChange({
              ...actions,
              capabilities: [
                ...actions.capabilities.filter(
                  (item) => item.toolkit !== "linear",
                ),
                ...(event.target.value === "read"
                  ? [{ toolkit: "linear", access: "read" } as const]
                  : []),
              ],
            })
          }
        >
          <option value="none">Disabled</option>
          <option value="read">Search and read issues</option>
        </select>
        <span className="text-xs font-normal text-muted-foreground">
          Requires your Linear connection at runtime. No issue changes or
          comments.
        </span>
      </label>
    </>
  );
}
