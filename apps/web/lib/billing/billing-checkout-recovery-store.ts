import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { billingCheckoutReservations } from "@/lib/db/schema";
import { checkoutRequestParametersSchema } from "./billing-checkout-request";

export const billingCheckoutRecoveryStore = {
  async getCheckoutForUser(userId: string) {
    const [saved] = await db
      .select({
        id: billingCheckoutReservations.providerSessionId,
        request: billingCheckoutReservations.requestPayload,
      })
      .from(billingCheckoutReservations)
      .where(eq(billingCheckoutReservations.userId, userId))
      .limit(1);
    if (!saved?.id || !saved.request) return null;
    return {
      id: saved.id,
      request: checkoutRequestParametersSchema.parse(saved.request),
    };
  },
};
