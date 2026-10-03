"use client";

import { useRef, useState } from "react";
import { z } from "zod";

const billingResponseSchema = z.object({
  url: z.url().optional(),
  error: z.object({ code: z.string() }).optional(),
});

function errorMessage(code?: string): string {
  switch (code) {
    case "not_authenticated":
      return "Your session expired. Sign in again to manage billing.";
    case "pro_subscription_exists":
      return "You already have a subscription. Use Manage billing to review it.";
    case "billing_checkout_in_progress":
      return "Your checkout is still being processed. Check your plan again in a moment.";
    case "billing_customer_required":
      return "Billing management becomes available after your first purchase.";
    default:
      return "We couldn’t open Creem. Please try again, or contact support if this continues.";
  }
}

export function useBillingActions() {
  const busy = useRef(false);
  const [action, setAction] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openBilling = async (kind: "checkout" | "portal") => {
    if (busy.current) return;
    busy.current = true;
    setAction(kind);
    setError(null);
    try {
      const response = await fetch("/api/billing/" + kind, { method: "POST" });
      const payload = billingResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !payload.success || !payload.data.url) {
        setError(
          errorMessage(payload.success ? payload.data.error?.code : undefined),
        );
        return;
      }
      const url = new URL(payload.data.url);
      if (
        url.protocol !== "https:" ||
        !["creem.io", "www.creem.io"].includes(url.hostname)
      ) {
        throw new Error("Invalid billing redirect");
      }
      window.location.assign(url.href);
    } catch {
      setError(errorMessage());
    } finally {
      busy.current = false;
      setAction(null);
    }
  };

  return { action, error, openBilling };
}
