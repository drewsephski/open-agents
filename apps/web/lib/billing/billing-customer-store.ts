import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { billingCustomers } from "@/lib/db/schema";
import type { BillingCustomerStore } from "./billing-sessions";

export const billingCustomerStore: BillingCustomerStore = {
  async getProviderCustomerIdForUser(userId) {
    const [customer] = await db
      .select({ providerCustomerId: billingCustomers.providerCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);
    return customer?.providerCustomerId ?? null;
  },
};
