import { z } from "zod";

export const subscriptionStatusSchema = z.enum([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const entitlementStateSchema = z.enum(["active", "inactive"]);
export type EntitlementState = z.infer<typeof entitlementStateSchema>;

export const financialStateSchema = z.enum([
  "paid",
  "partially_refunded",
  "fully_refunded",
  "disputed",
]);
export type FinancialState = z.infer<typeof financialStateSchema>;

export const subscriptionAccessStateSchema = z.object({
  status: subscriptionStatusSchema,
  entitlementState: entitlementStateSchema,
  financialState: financialStateSchema,
  periodStart: z.date(),
  periodEnd: z.date(),
  cancelAtPeriodEnd: z.boolean(),
});

export type SubscriptionAccessState = z.infer<
  typeof subscriptionAccessStateSchema
>;

export function hasPaidThroughAccess(
  subscription: SubscriptionAccessState | null,
  now: Date,
): subscription is SubscriptionAccessState {
  if (!subscription) {
    return false;
  }

  const isFinanciallyEligible =
    subscription.financialState === "paid" ||
    subscription.financialState === "partially_refunded";

  return (
    subscription.status === "active" &&
    subscription.entitlementState === "active" &&
    isFinanciallyEligible &&
    now >= subscription.periodStart &&
    now < subscription.periodEnd
  );
}
