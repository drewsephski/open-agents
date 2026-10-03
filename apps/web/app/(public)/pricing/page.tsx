import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { STORE } from "@/lib/store-details";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Launchstack Pro subscription pricing, included allowances, cancellation, and refunds.",
};

export default function PricingPage() {
  return (
    <>
      <h1>Launchstack Pro pricing</h1>
      <p className="text-3xl font-semibold tabular-nums">
        ${STORE.pro.monthlyPriceUsd} USD per month
      </p>
      <p>
        AI coding in cloud workspaces, with included AI usage and more time to
        build. Start without an API key, and manage your subscription through
        secure Creem checkout.
      </p>
      <Button asChild size="lg" className="h-12 w-full sm:w-auto">
        <Link href="/settings/billing">
          Get Pro — ${STORE.pro.monthlyPriceUsd}/month
        </Link>
      </Button>
      <section>
        <h2>Included each paid monthly period</h2>
        <ul>
          <li>A monthly AI usage allowance. No API key needed to start.</li>
          <li>
            {STORE.pro.sandboxHours} hours of running sandbox time, with up to{" "}
            {STORE.pro.concurrentSandboxes} concurrent running sandboxes.
          </li>
          <li>
            OpenRouter bring-your-own-key fallback when configured. Your
            OpenRouter usage is billed separately by OpenRouter.
          </li>
        </ul>
        <p>
          Inference is measured in provider-reported cost, not a fixed number of
          prompts or tokens. Model choice and task length affect consumption.
          Running sandbox time is wall-clock time, including waits; stopped or
          hibernated sandboxes do not consume running time.
        </p>
      </section>
      <section>
        <h2>Limits and renewal</h2>
        <p>
          The subscription renews monthly until canceled. There is no free
          trial, annual commitment, metered overage, or allowance rollover.
          Included allowances reset each paid billing period. If managed
          inference is exhausted, work can continue with your configured
          OpenRouter key at your expense. If sandbox time is exhausted, new or
          resumed sandbox work must wait for the next period. Inference and
          sandbox allowances are separate.
        </p>
        <p>
          Applicable taxes and the total are shown at checkout before payment.
        </p>
      </section>
      <section>
        <h2>Cancellation and refunds</h2>
        <p>
          Cancel future renewals using Manage billing in your billing settings
          or the Creem Customer Portal linked from your receipt. Cancellation
          keeps access through the end of the paid period unless the payment is
          refunded, disputed, or access is suspended for abuse.
        </p>
        <p>
          Request a full refund within {STORE.refundDays} days of an initial
          subscription payment or renewal. See our{" "}
          <Link href="/refunds">Refund Policy</Link> for the process.
        </p>
      </section>
      <p>
        Questions before subscribing?{" "}
        <Link href="/support">Contact support</Link>. Use of Launchstack is
        subject to our <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/acceptable-use">Acceptable Use Policy</Link>.
      </p>
    </>
  );
}
