import { z } from "zod";

export const checkoutRequestParametersSchema = z.object({
  productId: z.string().min(1),
  requestId: z.string().min(1),
  units: z.literal(1),
  customer: z.object({
    id: z.string().optional(),
    email: z.email().optional(),
  }),
  metadata: z.object({
    referenceId: z.string().min(1),
    launchstack_plan: z.literal("pro"),
  }),
  successUrl: z.url(),
});
export type CheckoutRequestParameters = z.infer<
  typeof checkoutRequestParametersSchema
>;
