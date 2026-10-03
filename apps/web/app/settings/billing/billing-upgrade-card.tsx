"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STORE } from "@/lib/store-details";

export function BillingUpgradeCard({
  pending,
  disabled,
  onBuy,
}: {
  pending: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <p className="text-sm font-medium text-muted-foreground">
          More room to build
        </p>
        <CardTitle className="text-balance text-2xl">Launchstack Pro</CardTitle>
        <p className="text-pretty text-sm text-muted-foreground">
          Start coding with AI included. No API key needed to get started.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <p>
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            ${STORE.pro.monthlyPriceUsd}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            USD / month
          </span>
        </p>
        <ul className="space-y-3 text-sm">
          {[
            "AI usage included each month",
            `${STORE.pro.sandboxHours} hours of cloud workspace time`,
            `${STORE.pro.concurrentSandboxes} workspaces running at once`,
            "Use your own OpenRouter key when included AI usage runs out",
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="text-pretty">{feature}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={disabled}
            onClick={onBuy}
          >
            {pending ? (
              <Loader2 className="size-4 motion-safe:animate-spin" />
            ) : null}
            {pending
              ? "Opening checkout…"
              : `Get Pro — $${STORE.pro.monthlyPriceUsd}/month`}
            {!pending && <ArrowRight className="size-4" />}
          </Button>
          <p className="text-center text-pretty text-xs leading-relaxed text-muted-foreground">
            Secure checkout with Creem. Renews monthly; cancel anytime.
            Applicable taxes shown before payment. No automatic overage charges.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
