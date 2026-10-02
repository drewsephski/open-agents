"use client";

import { AlertTriangle, CreditCard, KeyRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessSummary } from "@/hooks/use-access-summary";
import {
  getAllowancePercent,
  getAllowancePresentation,
} from "@/lib/access/access-ui";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "Not active";
}

function formatUsd(micros: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(micros / 1_000_000);
}

function Allowance({
  label,
  used,
  limit,
  display,
  kind,
}: {
  label: string;
  used: number;
  limit: number;
  display: string;
  kind: "inference" | "sandbox";
}) {
  const percent = getAllowancePercent(used, limit);
  const presentation = getAllowancePresentation(percent, kind);
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{display}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full bg-foreground",
            presentation.tone === "warning" && "bg-amber-500",
            presentation.tone === "action" && "bg-destructive",
          )}
          style={{ width: String(percent) + "%" }}
        />
      </div>
      {presentation.message && (
        <p
          className={cn(
            "text-pretty text-xs text-muted-foreground",
            presentation.tone === "warning" &&
              "text-amber-700 dark:text-amber-400",
            presentation.tone === "action" && "text-destructive",
          )}
        >
          {presentation.message}
        </p>
      )}
    </div>
  );
}

export function BillingSection({
  checkoutEnabled,
}: {
  checkoutEnabled: boolean;
}) {
  const { summary, loading, error: loadError } = useAccessSummary();
  const [action, setAction] = useState<"checkout" | "portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openBilling = async (kind: "checkout" | "portal") => {
    setAction(kind);
    setActionError(null);
    try {
      const response = await fetch("/api/billing/" + kind, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
      } | null;
      if (!response.ok || !payload?.url) throw new Error("unavailable");
      window.location.assign(payload.url);
    } catch {
      setActionError("This billing action is unavailable. Try again.");
      setAction(null);
    }
  };

  if (loading && !summary) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    );
  }
  if (!summary) {
    return (
      <p role="alert" className="text-pretty text-sm text-destructive">
        {loadError ?? "Billing status is unavailable."}
      </p>
    );
  }

  const isPro = summary.plan.id === "pro";
  const hasByok = summary.credential.state === "valid";
  const warning =
    summary.managedInference.warning === "prominent" ||
    summary.managedInference.warning === "exhausted" ||
    summary.sandbox.warning === "prominent" ||
    summary.sandbox.warning === "exhausted";

  return (
    <div className="space-y-6">
      {warning && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">An allowance needs attention</p>
            <p className="text-pretty text-sm text-muted-foreground">
              {hasByok
                ? "Your OpenRouter key is ready as an inference fallback."
                : "Add an OpenRouter key for fallback, or review the reset dates below."}
            </p>
            {!hasByok && (
              <Button asChild variant="link" className="h-auto px-0">
                <Link href="/settings/connections">Add OpenRouter key</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Current plan</p>
                <CardTitle className="mt-1 text-balance text-2xl">
                  {isPro ? "Pro" : "BYOK"}
                </CardTitle>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
                {isPro ? "$29/month" : "$0"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-pretty text-sm text-muted-foreground">
              {isPro
                ? "Managed inference, BYOK fallback, and 25 sandbox hours per paid period."
                : "Your OpenRouter key, 2 sandbox hours per UTC month, and 1 concurrent sandbox."}
            </p>
            {summary.plan.status && (
              <p className="text-sm">
                Subscription:{" "}
                <span className="font-medium">{summary.plan.status}</span>
              </p>
            )}
            {summary.plan.cancelAtPeriodEnd && (
              <p className="text-pretty text-sm text-amber-700 dark:text-amber-400">
                Pro remains available through{" "}
                <span className="tabular-nums">
                  {formatDate(summary.plan.periodEnd)}
                </span>
                , then returns to BYOK.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {!isPro && (
                <Button
                  disabled={action !== null || !checkoutEnabled}
                  onClick={() => void openBilling("checkout")}
                >
                  {action === "checkout"
                    ? "Opening checkout…"
                    : checkoutEnabled
                      ? "Upgrade to Pro"
                      : "Pro coming soon"}
                </Button>
              )}
              {summary.plan.portalAvailable && (
                <Button
                  variant="outline"
                  disabled={action !== null}
                  onClick={() => void openBilling("portal")}
                >
                  {action !== "portal" && <CreditCard className="size-4" />}
                  {action === "portal" ? "Opening portal…" : "Manage billing"}
                </Button>
              )}
            </div>
            {!isPro && !checkoutEnabled && (
              <p className="text-sm text-muted-foreground">
                Pro purchases will open after store approval and billing
                verification.
              </p>
            )}
            {actionError && (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-balance">Inference source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {hasByok ? "OpenRouter fallback ready" : "No BYOK fallback"}
                </p>
                <p className="text-pretty text-sm text-muted-foreground">
                  {hasByok
                    ? "Validated key ending in " + summary.credential.lastFour
                    : "Add a key to run BYOK or continue after managed inference runs out."}
                </p>
              </div>
            </div>
            <p className="text-sm">
              Default model:{" "}
              <span className="font-medium">{summary.defaultModel.label}</span>
            </p>
            <Button asChild variant="outline">
              <Link href="/settings/connections">
                {hasByok ? "Manage API key" : "Add API key"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-balance">Managed inference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPro ? (
              <Allowance
                label="Paid-period allowance"
                used={summary.managedInference.usedMicros}
                limit={summary.managedInference.limitMicros}
                display={
                  formatUsd(summary.managedInference.usedMicros) +
                  " of " +
                  formatUsd(summary.managedInference.limitMicros)
                }
                kind="inference"
              />
            ) : (
              <p className="text-pretty text-sm text-muted-foreground">
                Pro includes $10 of managed inference per paid billing period,
                with no overages and BYOK fallback.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Reset:{" "}
              <span className="tabular-nums">
                {formatDate(summary.managedInference.resetAt)}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-balance">Sandbox time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Allowance
              label="Running time"
              used={summary.sandbox.usedMilliseconds}
              limit={summary.sandbox.limitMilliseconds}
              display={
                (summary.sandbox.usedMilliseconds / 3_600_000).toFixed(1) +
                "h of " +
                (summary.sandbox.limitMilliseconds / 3_600_000).toFixed(0) +
                "h"
              }
              kind="sandbox"
            />
            <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {summary.sandbox.runningSandboxCount}/
                {summary.sandbox.concurrencyLimit} concurrent
              </span>
              <span className="tabular-nums">
                Reset: {formatDate(summary.sandbox.resetAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
