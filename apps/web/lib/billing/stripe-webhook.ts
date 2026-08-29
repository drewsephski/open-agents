import "server-only";
import type StripeSdk from "stripe";

interface StripeWebhookDependencies {
  stripe: {
    webhooks: {
      constructEvent(
        payload: string | Buffer,
        signature: string | string[],
        secret: string,
      ): StripeSdk.Event;
    };
  };
  webhookSecret: string;
  eventProcessor: {
    process(event: StripeSdk.Event): Promise<{ duplicate: boolean }>;
  };
}

export class StripeWebhookSignatureError extends Error {
  constructor() {
    super("stripe_webhook_signature_invalid");
    this.name = "StripeWebhookSignatureError";
  }
}

export function createStripeWebhookHandler(
  dependencies: StripeWebhookDependencies,
) {
  return {
    async handle(rawBody: string, signature: string | null) {
      if (!signature) {
        throw new StripeWebhookSignatureError();
      }
      let event: StripeSdk.Event;
      try {
        event = dependencies.stripe.webhooks.constructEvent(
          rawBody,
          signature,
          dependencies.webhookSecret,
        );
      } catch {
        throw new StripeWebhookSignatureError();
      }
      return dependencies.eventProcessor.process(event);
    },
  };
}
