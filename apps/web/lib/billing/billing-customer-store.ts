import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { billingCustomers } from "@/lib/db/schema";
import type { BillingCustomerStore } from "./billing-sessions";

export const billingCustomerStore: BillingCustomerStore = {
  async getStripeCustomerIdForUser(userId) {
    const [customer] = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);
    return customer?.stripeCustomerId ?? null;
  },
};
