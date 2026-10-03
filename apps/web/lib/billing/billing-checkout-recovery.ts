import "server-only";
import { z } from "zod";
import type { CheckoutRequestParameters } from "./billing-checkout-request";
import type { createBillingEventProcessor } from "./billing-reconciliation";

export interface RecoveryCheckout {
  id: string;
  status: string;
  requestId: string | null;
  productId: string;
  customerId: string | null;
  subscriptionId: string | null;
  transactionId: string | null;
  metadataUserId: string | null;
}

export const recoveryPaymentSchema = z.object({
  id: z.string().min(1),
  subscriptionId: z.string().min(1),
  status: z.enum(["paid", "partialRefund", "refunded", "chargedBack"]),
  amountPaid: z.number().int().positive(),
  refundedAmount: z.number().int().nonnegative(),
  paidAt: z.date(),
  periodStart: z.date(),
  periodEnd: z.date(),
});
export type RecoveryPayment = z.infer<typeof recoveryPaymentSchema>;

export function createBillingCheckoutRecovery(dependencies: {
  store: {
    getCheckoutForUser(userId: string): Promise<{
      id: string;
      request: CheckoutRequestParameters;
    } | null>;
  };
  provider: {
    retrieveRecoveryCheckout(id: string): Promise<RecoveryCheckout>;
    retrieveRecoveryPayment(id: string): Promise<RecoveryPayment>;
  };
  reconciler: Pick<
    ReturnType<typeof createBillingEventProcessor>,
    "reconcileVerifiedPayment"
  >;
  proProductId: string;
}) {
  return {
    async recover(userId: string) {
      // The browser cannot select a checkout, customer, product or subscription.
      const saved = await dependencies.store.getCheckoutForUser(userId);
      if (!saved) return;
      const checkout = await dependencies.provider.retrieveRecoveryCheckout(
        saved.id,
      );
      if (
        checkout.id !== saved.id ||
        checkout.requestId !== saved.request.requestId ||
        checkout.productId !== dependencies.proProductId ||
        saved.request.productId !== dependencies.proProductId ||
        saved.request.metadata.referenceId !== userId ||
        checkout.metadataUserId !== userId ||
        (saved.request.customer.id &&
          saved.request.customer.id !== checkout.customerId)
      )
        throw new Error("billing_checkout_ownership_invalid");
      if (checkout.status !== "completed") return;
      if (!checkout.subscriptionId || !checkout.transactionId)
        throw new Error("billing_checkout_payment_missing");

      const payment = recoveryPaymentSchema.parse(
        await dependencies.provider.retrieveRecoveryPayment(
          checkout.transactionId,
        ),
      );
      if (
        payment.id !== checkout.transactionId ||
        payment.subscriptionId !== checkout.subscriptionId ||
        payment.periodEnd <= payment.periodStart ||
        payment.refundedAmount > payment.amountPaid
      )
        throw new Error("billing_checkout_payment_invalid");

      await dependencies.reconciler.reconcileVerifiedPayment({
        userId,
        subscriptionId: payment.subscriptionId,
        transactionId: payment.id,
        paidAt: payment.paidAt,
        period: { start: payment.periodStart, end: payment.periodEnd },
        financialState:
          payment.status === "chargedBack"
            ? "disputed"
            : payment.status === "refunded" ||
                payment.refundedAmount === payment.amountPaid
              ? "fully_refunded"
              : payment.status === "partialRefund" || payment.refundedAmount > 0
                ? "partially_refunded"
                : "paid",
      });
    },
  };
}
