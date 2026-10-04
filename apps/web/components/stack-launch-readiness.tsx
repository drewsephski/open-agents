"use client";
import Link from "next/link";
import type { useLaunchReadiness } from "@/hooks/use-launch-readiness";
import { ACTION_TOOLKITS } from "@/lib/actions/registry";
import { Button } from "./ui/button";

export function StackLaunchReadiness({
  readiness,
  runtime,
}: {
  readiness: ReturnType<typeof useLaunchReadiness>;
  runtime?: string;
}) {
  const { data, error, isLoading } = readiness;
  return (
    <div className="shrink-0 space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
      <p className="text-muted-foreground">
        Runtime ·{" "}
        {(data?.runtime.backend ?? runtime) === "codex"
          ? "Codex"
          : "LaunchStack Native"}
      </p>
      {isLoading && <p role="status">Checking launch requirements…</p>}
      {error && (
        <div role="alert">
          Unable to verify launch readiness.{" "}
          <Button
            variant="link"
            size="sm"
            onClick={() => void readiness.refresh()}
          >
            Retry
          </Button>
        </div>
      )}
      {data?.requirements.map(({ toolkit, access, accounts }) => (
        <div key={toolkit} className="space-y-1">
          <p>
            {ACTION_TOOLKITS[toolkit].label} ·{" "}
            {access === "read"
              ? "Read"
              : "Read/write · writes require approval"}
          </p>
          {accounts.length > 1 ? (
            <label className="block">
              <span className="sr-only">
                {ACTION_TOOLKITS[toolkit].label} account
              </span>
              <select
                className="w-full rounded-md border border-input bg-background p-2"
                value={data.bindings[toolkit]?.accountId ?? ""}
                onChange={(event) =>
                  readiness.selectAccount(toolkit, event.target.value)
                }
              >
                <option value="" disabled>
                  Choose account
                </option>
                {accounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.label} · {account.accountId}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="break-words text-muted-foreground">
              {data.bindings[toolkit]?.label ?? "Not connected"}
              {data.bindings[toolkit] &&
                ` · ${data.bindings[toolkit].accountId}`}
            </p>
          )}
        </div>
      ))}
      {data && !data.ready && (
        <ul className="space-y-1" aria-label="Launch blockers">
          {data.blockers.map((blocker, index) => (
            <li
              key={`${blocker.code}-${blocker.toolkit}-${index}`}
              className="text-destructive"
            >
              {blocker.label}
              {blocker.code !== "account_selection_required" && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={blocker.remediation} className="underline">
                    Resolve
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {data?.ready && (
        <p role="status" className="text-muted-foreground">
          Ready to launch
        </p>
      )}
    </div>
  );
}
