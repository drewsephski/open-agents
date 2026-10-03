"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccessSummary } from "@/lib/access/access-ui";

export function BillingCheckoutStatus({
  confirmed,
  refresh,
}: {
  confirmed: boolean;
  refresh: () => Promise<AccessSummary | null>;
}) {
  const [timedOut, setTimedOut] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (confirmed) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 60_000;
    const check = async () => {
      const summary = await refresh();
      if (stopped || summary?.plan.id === "pro") return;
      if (Date.now() >= deadline) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(() => void check(), 3000);
    };
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [confirmed, refresh]);

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4"
    >
      {confirmed ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
      ) : (
        <Loader2 className="mt-0.5 size-5 shrink-0 motion-safe:animate-spin" />
      )}
      <div className="space-y-1">
        <p className="font-medium">
          {confirmed
            ? "You’re on Pro"
            : timedOut
              ? "Still waiting for payment confirmation"
              : "Checking your payment"}
        </p>
        <p className="text-pretty text-sm text-muted-foreground">
          {confirmed
            ? "Your payment is confirmed and your monthly usage is ready."
            : "Your plan updates once Creem confirms payment. If you received a receipt, you don’t need to purchase again."}
        </p>
        {!confirmed && timedOut && (
          <Button
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await refresh();
              setChecking(false);
            }}
          >
            {checking ? "Checking…" : "Check again"}
          </Button>
        )}
      </div>
    </div>
  );
}
