import { describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
mock.module("server-only", () => ({}));
const { createCreemWebhookHandler, verifyCreemSignature } =
  await import("./creem-webhook");
const secret = "local-test-secret";
describe("Creem signed webhooks", () => {
  test("verifies the exact raw bytes and rejects missing, malformed and tampered signatures", () => {
    const body = '{ "exact": true }\n';
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(() => verifyCreemSignature(body, signature, secret)).not.toThrow();
    for (const invalid of [null, "bad", "0".repeat(64)])
      expect(() => verifyCreemSignature(body, invalid, secret)).toThrow();
    expect(() =>
      verifyCreemSignature(body.trim(), signature, secret),
    ).toThrow();
  });
  test("uses the real adapter for paid events and propagates a processing failure for retry", async () => {
    let calls = 0;
    const handler = createCreemWebhookHandler({
      webhookSecret: secret,
      eventProcessor: {
        process: async () => {
          calls++;
          throw new Error("database unavailable");
        },
      },
    });
    const body = JSON.stringify({
      id: "evt_paid",
      eventType: "subscription.paid",
      created_at: Date.now(),
      object: {
        id: "sub_1",
        object: "subscription",
        product: "prod_pro",
        customer: "cust_1",
        collection_method: "charge_automatically",
        status: "active",
        current_period_start_date: "2026-10-02T00:00:00Z",
        current_period_end_date: "2026-11-02T00:00:00Z",
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
        mode: "prod",
      },
    });
    const response = await handler.handle(
      body,
      createHmac("sha256", secret).update(body).digest("hex"),
    );
    expect(response.status).toBe(500);
    expect(calls).toBe(1);
  });
  test("does not dispatch an unsigned checkout completion", async () => {
    let calls = 0;
    const handler = createCreemWebhookHandler({
      webhookSecret: secret,
      eventProcessor: {
        process: async () => {
          calls++;
          return { duplicate: false };
        },
      },
    });
    await expect(handler.handle("{}", null)).rejects.toThrow(
      "webhook_signature_invalid",
    );
    expect(calls).toBe(0);
  });
});
