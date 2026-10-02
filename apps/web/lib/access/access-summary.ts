import "server-only";

import { and, eq } from "drizzle-orm";
import type { AccessSummary } from "./access-ui";
import {
  BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
  BYOK_SANDBOX_CONCURRENCY_LIMIT,
  getAllowanceWarningLevel,
  getUtcCalendarMonthPeriod,
  PRO_SANDBOX_ALLOWANCE_MILLISECONDS,
  PRO_SANDBOX_CONCURRENCY_LIMIT,
} from "./allowance-period";
import { resolveModelCredential } from "./model-credential-resolver";
import { hasPaidThroughAccess } from "./subscription-state";
import { getBillingCredentialAccessState } from "@/lib/billing/billing-access-state";
import { getOpenRouterCredentialStatus } from "@/lib/credentials/provider-credentials";
import { db } from "@/lib/db/client";
import { billingCustomers, sandboxUsagePeriods } from "@/lib/db/schema";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import { accrueRunningSandboxMilliseconds } from "@/lib/sandbox/allowance";

export async function getAccessSummary(
  userId: string,
  now = new Date(),
  modelId = APP_DEFAULT_MODEL_ID,
): Promise<AccessSummary> {
  const [credential, billing, resolution, [customer]] = await Promise.all([
    getOpenRouterCredentialStatus(userId),
    getBillingCredentialAccessState(userId),
    resolveModelCredential({ userId, modelId }),
    db
      .select({ id: billingCustomers.id })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1),
  ]);

  const paidSubscription = hasPaidThroughAccess(billing.subscription, now)
    ? billing.subscription
    : null;
  const hasProAccess = paidSubscription !== null;
  const sandboxTier = hasProAccess ? "pro" : "byok";
  const sandboxPeriod = paidSubscription
    ? {
        start: paidSubscription.periodStart,
        end: paidSubscription.periodEnd,
      }
    : getUtcCalendarMonthPeriod(now);
  const [sandboxUsage] = await db
    .select({
      consumedMilliseconds: sandboxUsagePeriods.consumedMilliseconds,
      runningSandboxCount: sandboxUsagePeriods.runningSandboxCount,
      lastMeteredAt: sandboxUsagePeriods.lastMeteredAt,
    })
    .from(sandboxUsagePeriods)
    .where(
      and(
        eq(sandboxUsagePeriods.userId, userId),
        eq(sandboxUsagePeriods.tier, sandboxTier),
        eq(sandboxUsagePeriods.periodStart, sandboxPeriod.start),
      ),
    )
    .limit(1);
  const sandboxLimit = hasProAccess
    ? PRO_SANDBOX_ALLOWANCE_MILLISECONDS
    : BYOK_SANDBOX_ALLOWANCE_MILLISECONDS;
  const sandboxUsed = accrueRunningSandboxMilliseconds({
    consumedMilliseconds: sandboxUsage?.consumedMilliseconds ?? 0,
    runningSandboxCount: sandboxUsage?.runningSandboxCount ?? 0,
    lastMeteredAt: sandboxUsage?.lastMeteredAt ?? null,
    now,
    periodEnd: sandboxPeriod.end,
  });
  const managedUsed =
    billing.managedInference.spentMicros +
    billing.managedInference.reservedMicros;

  return {
    eligible: resolution.allowed,
    inferenceSource: resolution.allowed
      ? resolution.source === "administrative"
        ? null
        : resolution.source
      : null,
    defaultModel: {
      id: "z-ai/glm-5.3-flash",
      label: "GLM 5.3 Flash",
    },
    credential,
    plan: {
      id: hasProAccess ? "pro" : "byok",
      status: billing.subscription?.status ?? null,
      cancelAtPeriodEnd: billing.subscription?.cancelAtPeriodEnd ?? false,
      periodStart: sandboxPeriod.start.toISOString(),
      periodEnd: sandboxPeriod.end.toISOString(),
      portalAvailable: Boolean(customer),
    },
    managedInference: {
      usedMicros: managedUsed,
      limitMicros: billing.managedInference.allowanceMicros,
      remainingMicros: Math.max(
        0,
        billing.managedInference.allowanceMicros - managedUsed,
      ),
      warning: billing.managedInference.warning,
      resetAt: billing.managedInference.period?.end.toISOString() ?? null,
    },
    sandbox: {
      tier: sandboxTier,
      usedMilliseconds: sandboxUsed,
      limitMilliseconds: sandboxLimit,
      remainingMilliseconds: Math.max(0, sandboxLimit - sandboxUsed),
      runningSandboxCount: sandboxUsage?.runningSandboxCount ?? 0,
      concurrencyLimit: hasProAccess
        ? PRO_SANDBOX_CONCURRENCY_LIMIT
        : BYOK_SANDBOX_CONCURRENCY_LIMIT,
      warning: getAllowanceWarningLevel(sandboxUsed, sandboxLimit),
      resetAt: sandboxPeriod.end.toISOString(),
    },
  };
}
