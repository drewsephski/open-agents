import { z } from "zod";

const ownershipMetadataSchema = z.object({
  launchstack_plan: z.literal("pro"),
  launchstack_user_id: z.string().min(1),
});

export const checkoutRequestParametersSchema = z
  .object({
    mode: z.literal("subscription"),
    customer: z.string().min(1).optional(),
    customer_email: z.string().email().optional(),
    client_reference_id: z.string().min(1),
    integration_identifier: z.string().min(1),
    line_items: z.tuple([
      z.object({ price: z.string().min(1), quantity: z.literal(1) }),
    ]),
    metadata: ownershipMetadataSchema,
    subscription_data: z.object({ metadata: ownershipMetadataSchema }),
    success_url: z.string().url(),
    cancel_url: z.string().url(),
  })
  .refine((value) => !(value.customer && value.customer_email), {
    message: "Checkout request cannot contain customer and customer_email",
  });

export type CheckoutRequestParameters = z.infer<
  typeof checkoutRequestParametersSchema
>;
