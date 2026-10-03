"use client";

import { AlertTriangle, CreditCard, KeyRound } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessSummary } from "@/hooks/use-access-summary";
import { getAllowancePercent } from "@/lib/access/access-ui";
import { STORE } from "@/lib/store-details";
import { BillingAllowance } from "./billing-allowance";
import { BillingCheckoutStatus } from "./billing-checkout-status";
import { BillingUpgradeCard } from "./billing-upgrade-card";
import { useBillingActions } from "./use-billing-actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "Not active";
}

export function BillingSection({
  checkoutReturned,
  checkoutEnabled,
}: {
  checkoutReturned: boolean;
  checkoutEnabled: boolean;
}) {
  const { summary, loading, error: loadError, refresh } = useAccessSummary();
  const { action, error: actionError, openBilling } = useBillingActions();
  const syncPayment = useCallback(async () => {
    await fetch("/api/billing/sync", { method: "POST" }).catch(() => null);
    return refresh();
  }, [refresh]);

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
  const hasCodex = summary.codex?.connected ?? false;
  const hasByok = summary.credential.state === "valid";
  const warning =
    summary.managedInference.warning === "prominent" ||
    summary.managedInference.warning === "exhausted" ||
    summary.sandbox.warning === "prominent" ||
    summary.sandbox.warning === "exhausted";

  return (
    <div className="space-y-6">
      {checkoutReturned && (
        <BillingCheckoutStatus confirmed={isPro} refresh={syncPayment} />
      )}
      {actionError && (
        <p role="alert" className="text-pretty text-sm text-destructive">
          {actionError}
        </p>
      )}
      {!isPro && (
        <Card>
          <CardHeader>
            <CardTitle>Use your own AI for free</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-pretty text-sm text-muted-foreground">
              Connect your existing Codex subscription or an OpenRouter key. No
              Launchstack subscription required. Pro is optional when you want
              us to manage AI usage.
            </p>
            <Button asChild variant="outline">
              <Link href="/settings/connections">Connect your AI</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {!isPro && (
        <BillingUpgradeCard
          checkoutEnabled={checkoutEnabled}
          pending={action === "checkout"}
          disabled={action !== null || checkoutReturned}
          onBuy={() => void openBilling("checkout")}
        />
      )}
      {warning && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">You’re nearing a usage limit</p>
            <p className="text-pretty text-sm text-muted-foreground">
              {hasByok
                ? "Your OpenRouter key can keep AI work going when included usage runs out."
                : "Check the renewal dates below. You can add an OpenRouter key to continue AI work after your included usage runs out."}
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
                  {isPro ? "Pro" : "Free"}
                </CardTitle>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
                {isPro ? `$${STORE.pro.monthlyPriceUsd}/month` : "$0"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-pretty text-sm text-muted-foreground">
              {isPro
                ? "AI usage included, 25 hours of cloud workspace time, and 2 workspaces running at once."
                : "Use your Codex subscription or an OpenRouter key. Includes 2 hours of cloud workspace time each calendar month and 1 workspace running at a time."}
            </p>
            {summary.plan.status && (
              <p className="text-sm">
                Billing status:{" "}
                <span className="font-medium">
                  {summary.plan.cancelAtPeriodEnd
                    ? "Ends after this billing period"
                    : summary.plan.status?.replaceAll("_", " ")}
                </span>
              </p>
            )}
            {summary.plan.cancelAtPeriodEnd && (
              <p className="text-pretty text-sm text-amber-700 dark:text-amber-400">
                Pro remains available through{" "}
                <span className="tabular-nums">
                  {formatDate(summary.plan.periodEnd)}
                </span>
                , then returns to Free.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-balance">Your AI connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {hasCodex
                    ? "Codex subscription connected"
                    : hasByok
                      ? "Your OpenRouter key is connected"
                      : "No AI provider connected"}
                </p>
                <p className="text-pretty text-sm text-muted-foreground">
                  {hasCodex
                    ? "New chats use your existing Codex subscription."
                    : hasByok
                      ? "Key ending in " + summary.credential.lastFour
                      : "Connect Codex or OpenRouter for free. Choose Pro if you want Launchstack to manage your AI usage."}
                </p>
              </div>
            </div>
            <p className="text-sm">
              Default model:{" "}
              <span className="font-medium">{summary.defaultModel.label}</span>
            </p>
            <Button asChild variant="outline">
              <Link href="/settings/connections">
                {hasByok || hasCodex
                  ? "Manage AI connection"
                  : "Connect your AI"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-balance">Included AI usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPro ? (
              <BillingAllowance
                label="Monthly usage"
                used={summary.managedInference.usedMicros}
                limit={summary.managedInference.limitMicros}
                display={`${Math.round(getAllowancePercent(summary.managedInference.usedMicros, summary.managedInference.limitMicros))}% used`}
                kind="inference"
              />
            ) : (
              <p className="text-pretty text-sm text-muted-foreground">
                Pro includes a monthly AI usage allowance, so you can start
                without an API key. When it runs out, add your own OpenRouter
                key or wait for renewal. Usage varies by model and task.
              </p>
            )}
            {isPro && (
              <p className="text-sm text-muted-foreground">
                Renews:{" "}
                <span className="tabular-nums">
                  {formatDate(summary.managedInference.resetAt)}
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-balance">Cloud workspace time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BillingAllowance
              label="Time used"
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
                {summary.sandbox.concurrencyLimit} running
              </span>
              <span className="tabular-nums">
                Renews: {formatDate(summary.sandbox.resetAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
