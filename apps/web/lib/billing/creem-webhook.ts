import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Webhook } from "@creem_io/nextjs";
import { z } from "zod";
import { NextRequest } from "next/server";

export class CreemWebhookSignatureError extends Error {
  constructor() {
    super("webhook_signature_invalid");
    this.name = "CreemWebhookSignatureError";
  }
}
export function verifyCreemSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): void {
  if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature))
    throw new CreemWebhookSignatureError();
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new CreemWebhookSignatureError();
}
const envelopeSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  created_at: z.number().int().positive(),
  object: z.record(z.string(), z.unknown()),
});
export function createCreemWebhookHandler(dependencies: {
  webhookSecret: string;
  eventProcessor: { process(input: unknown): Promise<{ duplicate: boolean }> };
}) {
  const process = async (input: unknown) => {
    await dependencies.eventProcessor.process(input);
  };
  const adapter = Webhook({
    webhookSecret: dependencies.webhookSecret,
    onSubscriptionActive: process,
    onSubscriptionPaid: process,
    onSubscriptionTrialing: process,
    onSubscriptionCanceled: process,
    onSubscriptionExpired: process,
    onSubscriptionUnpaid: process,
    onSubscriptionUpdate: process,
    onSubscriptionPastDue: process,
    onSubscriptionPaused: process,
    onSubscriptionScheduledCancel: process,
    onRefundCreated: process,
    onDisputeCreated: process,
  });
  return {
    async handle(rawBody: string, signature: string | null): Promise<Response> {
      verifyCreemSignature(rawBody, signature, dependencies.webhookSecret);
      if (Buffer.byteLength(rawBody) > 256 * 1024)
        return Response.json(
          { error: { code: "webhook_too_large" } },
          { status: 413 },
        );
      const envelope = envelopeSchema.parse(JSON.parse(rawBody));
      // The adapter currently logs the full checkout.completed payload. Dispatch
      // that event directly after signature verification to keep customer data out of logs.
      if (envelope.eventType === "checkout.completed") {
        const result = await dependencies.eventProcessor.process({
          ...envelope.object,
          webhookId: envelope.id,
          webhookEventType: envelope.eventType,
          webhookCreatedAt: envelope.created_at,
        });
        return Response.json({ received: true, duplicate: result.duplicate });
      }
      return adapter(
        new NextRequest("https://launchstack.sh/api/billing/webhook", {
          method: "POST",
          headers: { "creem-signature": signature ?? "" },
          body: rawBody,
        }),
      );
    },
  };
}
