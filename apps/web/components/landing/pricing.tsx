import { Check } from "lucide-react";
import Link from "next/link";
import { PRICING_PLANS } from "@/lib/access/access-ui";

export function LandingPricing() {
  return (
    <section className="mx-auto max-w-[1320px] px-6 py-20 md:px-10 md:py-28">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase text-(--l-fg-3)">Pricing</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold sm:text-5xl">
          Bring a key, or use managed inference.
        </h2>
        <p className="mt-4 text-pretty text-base text-(--l-fg-2)">
          Both plans use GLM 5.3 Flash by default. Limits reset on the period
          shown, and managed inference has no overages.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {PRICING_PLANS.map((plan) => (
          <article
            key={plan.id}
            className="flex flex-col border border-(--l-border) bg-(--l-bg) p-6 sm:p-8"
          >
            <div>
              <h3 className="text-balance text-xl font-semibold">
                {plan.name}
              </h3>
              <p className="mt-2 text-pretty text-sm text-(--l-fg-2)">
                {plan.description}
              </p>
            </div>
            <div className="mt-8 flex items-end gap-2">
              <span className="text-4xl font-semibold tabular-nums">
                {plan.price}
              </span>
              <span className="pb-1 text-sm text-(--l-fg-3)">
                {plan.cadence}
              </span>
            </div>
            <ul className="my-8 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-sm text-(--l-fg-2)"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-(--l-fg)" />
                  <span className="text-pretty">{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/sign-up"
              className="inline-flex h-10 items-center justify-center border border-(--l-fg) bg-(--l-fg) px-5 text-sm font-medium text-(--l-bg) hover:opacity-90"
            >
              {plan.id === "pro" ? "Start with Pro" : "Start with BYOK"}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
