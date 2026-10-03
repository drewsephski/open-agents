import Link from "next/link";
import { STORE } from "@/lib/store-details";

export function LandingPricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-[1320px] scroll-mt-20 border-t border-(--l-border) px-6 py-16 md:px-10 md:py-24"
    >
      <div className="grid gap-10 md:grid-cols-2 md:gap-16">
        <div>
          <p className="font-mono text-xs uppercase text-(--l-fg-2)">
            Pro subscription
          </p>
          <h2
            id="pricing-heading"
            className="mt-3 text-balance text-3xl font-semibold sm:text-5xl"
          >
            A clear price for cloud coding.
          </h2>
          <p className="mt-5 text-pretty leading-relaxed text-(--l-fg-2)">
            Pro is our paid plan for AI coding agents in isolated cloud
            workspaces. The allowances below apply to each paid monthly billing
            period.
          </p>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-(--l-fg-2)">
            Start with your own OpenRouter key for free, or choose Pro to get
            included AI usage and more cloud workspace time.
          </p>
        </div>
        <article className="border border-(--l-border) p-6 sm:p-8">
          <h3 className="text-balance text-xl font-semibold">
            Launchstack Pro
          </h3>
          <p className="mt-5">
            <span className="text-4xl font-semibold tabular-nums">
              ${STORE.pro.monthlyPriceUsd}
            </span>
            <span className="ml-2 text-(--l-fg-2)">USD / month</span>
          </p>
          <ul className="my-6 list-disc space-y-3 pl-5 text-(--l-fg-2)">
            <li>AI usage included each month; no API key needed to start</li>
            <li>
              {STORE.pro.sandboxHours} hours of running sandbox time per paid
              period
            </li>
            <li>
              Up to {STORE.pro.concurrentSandboxes} concurrently running
              sandboxes
            </li>
            <li>
              OpenRouter bring-your-own-key fallback; your provider bills that
              usage separately
            </li>
          </ul>
          <p className="text-pretty text-sm leading-relaxed text-(--l-fg-2)">
            Monthly renewal. No free trial, annual commitment, metered overages,
            or allowance rollover. Applicable tax is shown at checkout. Managed
            inference and sandbox time are separate limits; sandbox time
            measures running wall-clock time, including waits.
          </p>
          <Link
            href="/settings/billing"
            className="mt-6 flex min-h-12 items-center justify-center bg-(--l-fg) px-5 py-3 font-medium text-(--l-bg) transition-opacity hover:opacity-90"
          >
            Get Pro — ${STORE.pro.monthlyPriceUsd}/month
          </Link>
          <Link
            href="/pricing"
            className="mt-6 inline-block underline underline-offset-4"
          >
            Pricing, cancellation, and refunds
          </Link>
        </article>
      </div>
    </section>
  );
}
