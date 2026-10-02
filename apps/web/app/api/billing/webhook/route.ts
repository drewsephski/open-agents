import { getCreemWebhookHandler } from "@/lib/billing/billing-runtime";
import { CreemWebhookSignatureError } from "@/lib/billing/creem-webhook";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return await getCreemWebhookHandler().handle(
      await request.text(),
      request.headers.get("creem-signature"),
    );
  } catch (error) {
    const signatureInvalid = error instanceof CreemWebhookSignatureError;
    if (!signatureInvalid) console.error("Creem webhook processing failed");
    return Response.json(
      {
        error: {
          code: signatureInvalid
            ? "webhook_signature_invalid"
            : "webhook_processing_failed",
        },
      },
      { status: signatureInvalid ? 400 : 500 },
    );
  }
}
