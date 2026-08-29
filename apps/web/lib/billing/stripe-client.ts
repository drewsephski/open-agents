import "server-only";
import StripeClient from "stripe";

let stripeClient: StripeClient | null = null;
let configuredSecretKey: string | null = null;

export function getStripeClient(secretKey: string): StripeClient {
  if (!stripeClient || configuredSecretKey !== secretKey) {
    stripeClient = new StripeClient(secretKey);
    configuredSecretKey = secretKey;
  }
  return stripeClient;
}
