import { describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

mock.module("server-only", () => ({}));

const { createBillingCheckoutStore } = await import("./billing-checkout-store");
const { createBillingStateStore } = await import("./billing-state-store");
const { createManagedInferenceKeyStore } = await import("./managed-key-store");

const persistedCheckoutRequest = {
  productId: "prod_pro",
  requestId: "owner_request_1",
  units: 1 as const,
  customer: { email: "owner@example.com" },
  metadata: { referenceId: "user-1", launchstack_plan: "pro" as const },
  successUrl: "https://launchstack.sh/settings/billing?checkout=success",
};

async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE billing_subscriptions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      status text NOT NULL,
      provider_customer_id text NOT NULL,
      provider_product_id text NOT NULL,
      provider_price_id text NOT NULL,
      financial_state text NOT NULL DEFAULT 'unpaid',
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      current_period_start timestamp,
      current_period_end timestamp,
      canceled_at timestamp,
      latest_event_created_at timestamp NOT NULL,
      latest_financial_event_created_at timestamp,
      latest_financial_event_id text,
      paid_period_start timestamp,
      paid_period_end timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE billing_checkout_reservations (
      user_id text PRIMARY KEY,
      state text NOT NULL DEFAULT 'failed',
      generation integer NOT NULL DEFAULT 0,
      claim_token text,
      lease_expires_at timestamp,
      provider_session_id text,
      session_url text,
      session_expires_at timestamp,
      request_payload jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE billing_webhook_receipts (
      provider_event_id text PRIMARY KEY,
      event_type text NOT NULL,
      event_created_at timestamp NOT NULL,
      processing_state text NOT NULL DEFAULT 'processing',
      processing_error_code text,
      claim_token text,
      claim_generation integer NOT NULL DEFAULT 0,
      lease_expires_at timestamp,
      received_at timestamp NOT NULL DEFAULT now(),
      processed_at timestamp
    );
    CREATE TABLE billing_entitlements (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      state text NOT NULL,
      period_start timestamp,
      period_end timestamp,
      subscription_id text NOT NULL,
      kind text NOT NULL,
      latest_event_created_at timestamp NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (user_id, kind)
    );
    CREATE TABLE managed_inference_keys (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      entitlement_id text,
      provider text NOT NULL DEFAULT 'openrouter',
      provider_key_id text,
      ciphertext text,
      nonce text,
      authentication_tag text,
      encryption_key_version integer,
      key_hash text,
      label text NOT NULL,
      lifecycle_state text NOT NULL DEFAULT 'provisioning',
      claim_token text,
      claim_generation integer NOT NULL DEFAULT 0,
      lease_expires_at timestamp,
      spend_limit_micros integer NOT NULL DEFAULT 10000000,
      period_start timestamp NOT NULL,
      period_end timestamp NOT NULL,
      provisioning_error_code text,
      provisioned_at timestamp,
      rotated_at timestamp,
      revoked_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE managed_key_cleanup_jobs (
      provider_key_id text PRIMARY KEY,
      user_id text NOT NULL,
      managed_key_id text,
      label text NOT NULL,
      state text NOT NULL DEFAULT 'pending',
      available_at timestamp NOT NULL,
      claim_token text,
      claim_generation integer NOT NULL DEFAULT 0,
      lease_expires_at timestamp,
      last_error_code text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
  const database = drizzle(client);
  await client.query("INSERT INTO users (id) VALUES ('user-1')");
  return { client, database };
}

describe("production billing store concurrency", () => {
  test("reclaims Checkout with the same generation/request and rejects the stale publisher", async () => {
    const { client, database } = await createTestDatabase();
    await client.query(
      `INSERT INTO billing_checkout_reservations
        (user_id, state, generation, claim_token, lease_expires_at, request_payload)
       VALUES ($1, 'creating', 4, 'stale-token', $2, $3)`,
      [
        "user-1",
        new Date("2020-01-01T00:00:00.000Z"),
        JSON.stringify(persistedCheckoutRequest),
      ],
    );
    const store = createBillingCheckoutStore(
      database as unknown as Parameters<typeof createBillingCheckoutStore>[0],
    );

    const reclaimed = await store.claimCheckout("user-1");
    expect(reclaimed).toMatchObject({
      state: "claimed",
      claim: { generation: 4 },
      request: persistedCheckoutRequest,
    });
    if (reclaimed.state !== "claimed") {
      throw new Error("Checkout lease was not reclaimed");
    }
    await expect(
      store.publishCheckout({
        userId: "user-1",
        claim: { token: "stale-token", generation: 4 },
        session: {
          id: "cs_stale",
          url: "https://www.creem.io/checkout/prod_pro/stale",
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        },
      }),
    ).resolves.toMatchObject({ accepted: false });
    await expect(
      store.publishCheckout({
        userId: "user-1",
        claim: reclaimed.claim,
        session: {
          id: "cs_current",
          url: "https://www.creem.io/checkout/prod_pro/current",
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      currentSession: { id: "cs_current" },
    });
    await client.close();
  });

  test("conditionally activates and revokes a managed key by token and generation", async () => {
    const { client, database } = await createTestDatabase();
    await client.query(
      `INSERT INTO managed_inference_keys
        (id, user_id, entitlement_id, label, lifecycle_state, claim_token,
         claim_generation, lease_expires_at, period_start, period_end)
       VALUES ($1, $2, $3, $4, 'provisioning', 'current-token', 2, $5, $6, $7)`,
      [
        "managed-1",
        "user-1",
        null,
        "managed label",
        new Date("2030-01-01T00:00:00.000Z"),
        new Date("2026-08-01T00:00:00.000Z"),
        new Date("2026-09-01T00:00:00.000Z"),
      ],
    );
    await client.query(
      `INSERT INTO managed_key_cleanup_jobs
        (provider_key_id, user_id, managed_key_id, label, state, available_at)
       VALUES ('provider-1', 'user-1', 'managed-1', 'managed label', 'pending', now())`,
    );
    const store = createManagedInferenceKeyStore(
      database as unknown as Parameters<
        typeof createManagedInferenceKeyStore
      >[0],
    );
    const envelope = {
      ciphertext: "ciphertext",
      nonce: "nonce",
      authenticationTag: "tag",
      encryptionKeyVersion: 1,
    };

    await expect(
      store.activate({
        id: "managed-1",
        claim: { token: "stale-token", generation: 2 },
        providerKeyId: "provider-1",
        keyHash: "hash-1",
        envelope,
      }),
    ).resolves.toBe(false);
    await expect(
      store.activate({
        id: "managed-1",
        claim: { token: "current-token", generation: 2 },
        providerKeyId: "provider-1",
        keyHash: "hash-1",
        envelope,
      }),
    ).resolves.toBe(true);

    const [active] = await store.listForUser("user-1");
    if (!active) {
      throw new Error("Managed key is missing");
    }
    const revocation = await store.claimRevocation(active);
    if (revocation.state !== "claimed") {
      throw new Error("Managed key revocation was not claimed");
    }
    await expect(
      store.finishRevocation({
        id: active.id,
        claim: {
          token: "stale-token",
          generation: revocation.claim.generation,
        },
      }),
    ).resolves.toBe(false);
    await expect(
      store.finishRevocation({ id: active.id, claim: revocation.claim }),
    ).resolves.toBe(true);
    expect((await store.listForUser("user-1"))[0]?.lifecycleState).toBe(
      "revoked",
    );
    await client.close();
  });

  test("prevents a stale webhook receipt worker from writing a terminal state", async () => {
    const { client, database } = await createTestDatabase();
    await client.query(
      `INSERT INTO billing_webhook_receipts
        (provider_event_id, event_type, event_created_at, processing_state,
         claim_token, claim_generation, lease_expires_at)
       VALUES ('evt_1', 'subscription.paid', now(), 'processing',
               'current-token', 2, $1)`,
      [new Date("2030-01-01T00:00:00.000Z")],
    );
    const store = createBillingStateStore(
      database as unknown as Parameters<typeof createBillingStateStore>[0],
    );

    await expect(
      store.markEventProcessed({
        eventId: "evt_1",
        token: "stale-token",
        generation: 1,
      }),
    ).resolves.toBe(false);
    await expect(
      store.markEventProcessed({
        eventId: "evt_1",
        token: "current-token",
        generation: 2,
      }),
    ).resolves.toBe(true);
    await expect(
      store.markEventFailed({
        claim: {
          eventId: "evt_1",
          token: "current-token",
          generation: 2,
        },
        errorCode: "stale_failure",
      }),
    ).resolves.toBe(false);
    const receipt = await client.query<{
      processing_state: string;
      processing_error_code: string | null;
    }>(
      "SELECT processing_state, processing_error_code FROM billing_webhook_receipts WHERE provider_event_id = 'evt_1'",
    );
    expect(receipt.rows[0]).toEqual({
      processing_state: "processed",
      processing_error_code: null,
    });
    await client.close();
  });
});

describe("persisted paid-period access", () => {
  test("revokes refunded access, rejects a paid replay, and requires renewal payment", async () => {
    const { client, database } = await createTestDatabase();
    try {
      const store = createBillingStateStore(
        database as unknown as Parameters<typeof createBillingStateStore>[0],
      );
      const period = {
        start: new Date("2026-10-02T00:00:00Z"),
        end: new Date("2026-11-02T00:00:00Z"),
      };
      const subscription = {
        id: "sub_1",
        providerCustomerId: "cust_1",
        providerProductId: "prod_pro",
        providerPriceId: "prod_pro",
        status: "active" as const,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        periodStart: period.start,
        periodEnd: period.end,
      };
      const reconcile = (
        state: "paid" | "fully_refunded",
        id: string,
        seconds: number,
      ) =>
        store.reconcileFinancialState({
          subscriptionId: subscription.id,
          financialState: state,
          period,
          eventCreatedAt: new Date(period.start.getTime() + seconds * 1000),
          eventId: id,
        });
      expect(
        (
          await store.reconcileSubscription({
            userId: "user-1",
            subscription,
            eventCreatedAt: period.start,
          })
        ).state,
      ).toBe("inactive");
      expect((await reconcile("paid", "paid_1", 1)).state).toBe("active");
      expect((await reconcile("fully_refunded", "refund_1", 2)).state).toBe(
        "inactive",
      );
      expect((await reconcile("paid", "paid_replay", 3)).state).toBe(
        "inactive",
      );
      const renewalPeriod = {
        start: period.end,
        end: new Date("2026-12-02T00:00:00Z"),
      };
      expect(
        (
          await store.reconcileSubscription({
            userId: "user-1",
            subscription: {
              ...subscription,
              periodStart: renewalPeriod.start,
              periodEnd: renewalPeriod.end,
            },
            eventCreatedAt: renewalPeriod.start,
          })
        ).state,
      ).toBe("inactive");
      expect((await reconcile("paid", "old_paid", 4)).state).toBe("inactive");
      expect(
        (
          await store.reconcileFinancialState({
            subscriptionId: subscription.id,
            financialState: "paid",
            period: renewalPeriod,
            eventCreatedAt: new Date(renewalPeriod.start.getTime() + 1000),
            eventId: "renewal_paid",
          })
        ).state,
      ).toBe("active");
      expect(
        (
          await store.reconcileSubscription({
            userId: "user-1",
            subscription,
            eventCreatedAt: period.start,
          })
        ).periodStart,
      ).toEqual(renewalPeriod.start);
    } finally {
      await client.close();
    }
  });
});
