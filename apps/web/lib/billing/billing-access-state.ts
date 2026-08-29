import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { CredentialEnvelope } from "@/lib/credentials/envelope-encryption";
import { db } from "@/lib/db/client";
import {
  billingEntitlements,
  billingSubscriptions,
  managedInferenceKeys,
  usageEvents,
} from "@/lib/db/schema";
import type { ManagedKeyState } from "@/lib/access/inference-source";
import type { SubscriptionAccessState } from "@/lib/access/subscription-state";
import type { AllowancePeriod } from "@/lib/access/allowance-period";

export interface BillingCredentialAccessState {
  subscription: SubscriptionAccessState | null;
  managedInference: {
    keyState: ManagedKeyState;
    period: AllowancePeriod | null;
    spentMicros: number;
    reservedMicros: number;
    envelope: CredentialEnvelope | null;
  };
}

const unavailableState: BillingCredentialAccessState = {
  subscription: null,
  managedInference: {
    keyState: "missing",
    period: null,
    spentMicros: 0,
    reservedMicros: 0,
    envelope: null,
  },
};

function toMicros(rawUsd: string): number {
  const usd = Number(rawUsd);
  if (!(Number.isFinite(usd) && usd >= 0)) {
    throw new Error("Managed inference spend is invalid");
  }
  return Math.round(usd * 1_000_000);
}

export async function getBillingCredentialAccessState(
  userId: string,
): Promise<BillingCredentialAccessState> {
  const [billing] = await db
    .select({
      entitlementId: billingEntitlements.id,
      entitlementState: billingEntitlements.state,
      entitlementPeriodStart: billingEntitlements.periodStart,
      entitlementPeriodEnd: billingEntitlements.periodEnd,
      subscriptionStatus: billingSubscriptions.status,
      financialState: billingSubscriptions.financialState,
      cancelAtPeriodEnd: billingSubscriptions.cancelAtPeriodEnd,
      subscriptionPeriodStart: billingSubscriptions.currentPeriodStart,
      subscriptionPeriodEnd: billingSubscriptions.currentPeriodEnd,
    })
    .from(billingEntitlements)
    .innerJoin(
      billingSubscriptions,
      eq(billingEntitlements.subscriptionId, billingSubscriptions.id),
    )
    .where(
      and(
        eq(billingEntitlements.userId, userId),
        eq(billingEntitlements.kind, "managed_openrouter"),
        eq(billingSubscriptions.userId, userId),
      ),
    )
    .limit(1);
  if (
    !billing?.entitlementPeriodStart ||
    !billing.entitlementPeriodEnd ||
    !billing.subscriptionPeriodStart ||
    !billing.subscriptionPeriodEnd ||
    billing.entitlementPeriodStart.getTime() !==
      billing.subscriptionPeriodStart.getTime() ||
    billing.entitlementPeriodEnd.getTime() !==
      billing.subscriptionPeriodEnd.getTime()
  ) {
    return unavailableState;
  }

  const period = {
    start: billing.entitlementPeriodStart,
    end: billing.entitlementPeriodEnd,
  };
  const [key] = await db
    .select({
      lifecycleState: managedInferenceKeys.lifecycleState,
      ciphertext: managedInferenceKeys.ciphertext,
      nonce: managedInferenceKeys.nonce,
      authenticationTag: managedInferenceKeys.authenticationTag,
      encryptionKeyVersion: managedInferenceKeys.encryptionKeyVersion,
    })
    .from(managedInferenceKeys)
    .where(
      and(
        eq(managedInferenceKeys.userId, userId),
        eq(managedInferenceKeys.entitlementId, billing.entitlementId),
        eq(managedInferenceKeys.periodStart, period.start),
        eq(managedInferenceKeys.periodEnd, period.end),
      ),
    )
    .orderBy(desc(managedInferenceKeys.updatedAt))
    .limit(1);
  const envelope =
    key?.ciphertext &&
    key.nonce &&
    key.authenticationTag &&
    key.encryptionKeyVersion !== null
      ? {
          ciphertext: key.ciphertext,
          nonce: key.nonce,
          authenticationTag: key.authenticationTag,
          encryptionKeyVersion: key.encryptionKeyVersion,
        }
      : null;

  const [spend] = await db
    .select({
      usd: sql<string>`coalesce(sum(${usageEvents.inferenceCostUsd}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.credentialSource, "managed"),
        gte(usageEvents.createdAt, period.start),
        lt(usageEvents.createdAt, period.end),
      ),
    );

  return {
    subscription: {
      status: billing.subscriptionStatus,
      entitlementState: billing.entitlementState,
      financialState: billing.financialState,
      periodStart: billing.subscriptionPeriodStart,
      periodEnd: billing.subscriptionPeriodEnd,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    },
    managedInference: {
      keyState: key?.lifecycleState ?? "missing",
      period,
      spentMicros: toMicros(spend?.usd ?? "0"),
      reservedMicros: 0,
      envelope,
    },
  };
}
