import { getStripeWebhookHandler } from "@/lib/billing/billing-runtime";
import { StripeWebhookSignatureError } from "@/lib/billing/stripe-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const result = await getStripeWebhookHandler().handle(rawBody, signature);
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof StripeWebhookSignatureError) {
      return Response.json(
        { error: { code: "webhook_signature_invalid" } },
        { status: 400 },
      );
    }
    console.error("Stripe webhook processing failed");
    return Response.json(
      { error: { code: "webhook_processing_failed" } },
      { status: 500 },
    );
  }
}
