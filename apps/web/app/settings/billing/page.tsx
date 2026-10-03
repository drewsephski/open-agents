import type { Metadata } from "next";
import { BillingSection } from "./billing-section";

export const metadata: Metadata = {
  title: "Billing",
  description: "Manage your Launchstack plan and allowances.",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-balance text-2xl font-semibold">Billing</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Choose your plan, track usage, and manage your subscription.
        </p>
      </div>
      <BillingSection checkoutReturned={checkout === "success"} />
    </div>
  );
}
