import type { Metadata } from "next";
import Link from "next/link";
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
        Pro purchases are not open yet. We are completing payment review and
        subscription fulfillment before accepting payments. These are the
        planned subscription price and allowances, not an offer of immediate
        paid access.
      </p>
      <section>
        <h2>Included each paid monthly period</h2>
        <ul>
          <li>${STORE.pro.inferenceUsd} of managed AI inference.</li>
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
          Applicable taxes are disclosed at checkout before payment. The old
          runtime illustration of $0.02 per minute is not the subscription price
          or an extra customer charge.
        </p>
      </section>
      <section>
        <h2>Cancellation and refunds</h2>
        <p>
          Once subscriptions open, you can cancel future renewals through the
          Creem Customer Portal linked from your receipt. Cancellation keeps
          access through the end of the paid period unless the payment is
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
