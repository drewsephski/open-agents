import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { evaluateSandboxAccess } from "@/lib/access/access-policy";
import {
  type AccessFailure,
  serializeExhaustedAllowanceState,
} from "@/lib/access/access-failure";
import type { CredentialState } from "@/lib/access/inference-source";
import type { SubscriptionAccessState } from "@/lib/access/subscription-state";
import { getBillingCredentialAccessState } from "@/lib/billing/billing-access-state";
import { providerCredentialStore } from "@/lib/credentials/provider-credential-store";
import { db } from "@/lib/db/client";
import {
  sandboxMeteringLeases,
  sandboxUsagePeriods,
  sessions,
} from "@/lib/db/schema";
import { getSessionById } from "@/lib/db/sessions";
import {
  getAllowanceWarningLevel as getSharedAllowanceWarningLevel,
  type AllowanceWarningLevel,
} from "@/lib/access/allowance-period";

export type { AllowanceWarningLevel };

export interface SandboxAllowanceState {
  tier: "byok" | "pro";
  consumedMilliseconds: number;
  allowanceMilliseconds: number;
  concurrencyLimit: number;
  runningSandboxCount: number;
  resetAt: Date;
  warning: AllowanceWarningLevel;
}

export type SandboxAdmission =
  | { allowed: true; state: SandboxAllowanceState }
  | { allowed: false; failure: AccessFailure };

interface SandboxAccessState {
  byokCredentialState: CredentialState;
  subscription: SubscriptionAccessState | null;
}

export interface SandboxAllowanceStore {
  admit(params: {
    userId: string;
    sessionId: string;
    operation: "create" | "resume";
    access: SandboxAccessState;
    now: Date;
  }): Promise<SandboxAdmission>;
  confirm(sessionId: string, now: Date): Promise<void>;
  release(sessionId: string, now: Date): Promise<void>;
  meter(sessionId: string, now: Date): Promise<void>;
}

export const SANDBOX_STARTING_LEASE_TTL_MS = 15 * 60 * 1000;

export class SandboxAccessDeniedError extends Error {
  readonly failure: AccessFailure;

  constructor(failure: AccessFailure) {
    super(`Sandbox access denied: ${failure.code}`);
    this.name = "SandboxAccessDeniedError";
    this.failure = failure;
  }
}

export function getAllowanceWarningLevel(
  consumedMilliseconds: number,
  allowanceMilliseconds: number,
): AllowanceWarningLevel {
  return getSharedAllowanceWarningLevel(
    consumedMilliseconds,
    allowanceMilliseconds,
  );
}

export function accrueRunningSandboxMilliseconds(params: {
  consumedMilliseconds: number;
  runningSandboxCount: number;
  lastMeteredAt: Date | null;
  now: Date;
  periodEnd: Date;
}): number {
  if (!params.lastMeteredAt || params.runningSandboxCount === 0) {
    return params.consumedMilliseconds;
  }
  const end = Math.min(params.now.getTime(), params.periodEnd.getTime());
  const elapsed = Math.max(0, end - params.lastMeteredAt.getTime());
  return params.consumedMilliseconds + elapsed * params.runningSandboxCount;
}

export function createSandboxAllowanceService(dependencies: {
  loadAccessState(userId: string): Promise<SandboxAccessState>;
  store: SandboxAllowanceStore;
  now?: () => Date;
}) {
  const now = dependencies.now ?? (() => new Date());
  return {
    async admit(params: {
      userId: string;
      sessionId: string;
      operation: "create" | "resume";
    }): Promise<SandboxAdmission> {
      const access = await dependencies.loadAccessState(params.userId);
      return dependencies.store.admit({ ...params, access, now: now() });
    },
    confirm: (sessionId: string) =>
      dependencies.store.confirm(sessionId, now()),
    release: (sessionId: string) =>
      dependencies.store.release(sessionId, now()),
    meter: (sessionId: string) => dependencies.store.meter(sessionId, now()),
  };
}

async function loadSandboxAccessState(
  userId: string,
): Promise<SandboxAccessState> {
  const [credential, billing] = await Promise.all([
    providerCredentialStore.getForUser(userId),
    getBillingCredentialAccessState(userId),
  ]);
  return {
    byokCredentialState: credential?.validationState ?? "missing",
    subscription: billing.subscription,
  };
}

function stateFrom(params: {
  tier: "byok" | "pro";
  consumedMilliseconds: number;
  allowanceMilliseconds: number;
  concurrencyLimit: number;
  runningSandboxCount: number;
  resetAt: Date;
}): SandboxAllowanceState {
  return {
    ...params,
    warning: getAllowanceWarningLevel(
      params.consumedMilliseconds,
      params.allowanceMilliseconds,
    ),
  };
}

export function createSandboxAllowanceStore(
  database: typeof db = db,
): SandboxAllowanceStore {
  async function settleLease(
    sessionId: string,
    now: Date,
    release: boolean,
  ): Promise<void> {
    await database.transaction(async (tx) => {
      const [lease] = await tx
        .select({
          usagePeriodId: sandboxMeteringLeases.usagePeriodId,
          state: sandboxMeteringLeases.state,
        })
        .from(sandboxMeteringLeases)
        .where(eq(sandboxMeteringLeases.sessionId, sessionId))
        .limit(1);
      if (!lease) return;
      const [period] = await tx
        .select()
        .from(sandboxUsagePeriods)
        .where(eq(sandboxUsagePeriods.id, lease.usagePeriodId))
        .limit(1)
        .for("update");
      if (!period) return;
      const [{ count }] = await tx
        .select({
          count: sql<number>`count(*)::integer`,
        })
        .from(sandboxMeteringLeases)
        .where(
          and(
            eq(sandboxMeteringLeases.usagePeriodId, period.id),
            eq(sandboxMeteringLeases.state, "running"),
          ),
        );
      const runningCount = count ?? 0;
      const consumedMilliseconds = accrueRunningSandboxMilliseconds({
        consumedMilliseconds: period.consumedMilliseconds,
        runningSandboxCount: runningCount,
        lastMeteredAt: period.lastMeteredAt,
        now,
        periodEnd: period.periodEnd,
      });
      const meteredAt = new Date(
        Math.max(period.lastMeteredAt?.getTime() ?? 0, now.getTime()),
      );
      if (release) {
        await tx
          .delete(sandboxMeteringLeases)
          .where(eq(sandboxMeteringLeases.sessionId, sessionId));
      }
      await tx
        .update(sandboxUsagePeriods)
        .set({
          consumedMilliseconds,
          runningSandboxCount: Math.max(
            0,
            runningCount - (release && lease.state === "running" ? 1 : 0),
          ),
          lastMeteredAt: meteredAt,
          revision: period.revision + 1,
          updatedAt: now,
        })
        .where(eq(sandboxUsagePeriods.id, period.id));
    });
  }

  return {
    async admit(params) {
      const preliminary = evaluateSandboxAccess({
        kind: "sandbox",
        operation: params.operation,
        now: params.now,
        byokCredentialState: params.access.byokCredentialState,
        subscription: params.access.subscription,
        usage: {
          byokPeriodConsumedMilliseconds: 0,
          proPeriodConsumedMilliseconds: 0,
          runningSandboxCount: 0,
        },
      });
      if (!preliminary.allowed) {
        await settleLease(params.sessionId, params.now, true);
        return preliminary;
      }

      return database.transaction(async (tx) => {
        await tx
          .insert(sandboxUsagePeriods)
          .values({
            id: nanoid(),
            userId: params.userId,
            tier: preliminary.tier,
            periodStart: preliminary.period.start,
            periodEnd: preliminary.period.end,
            allowanceMilliseconds: preliminary.allowanceMilliseconds,
            lastMeteredAt: params.now,
          })
          .onConflictDoNothing();
        const [period] = await tx
          .select()
          .from(sandboxUsagePeriods)
          .where(
            and(
              eq(sandboxUsagePeriods.userId, params.userId),
              eq(sandboxUsagePeriods.tier, preliminary.tier),
              eq(sandboxUsagePeriods.periodStart, preliminary.period.start),
            ),
          )
          .limit(1)
          .for("update");
        if (!period) {
          return {
            allowed: false,
            failure: {
              code: "access_state_invalid",
              remediation: ["retry_later"],
            },
          };
        }

        const hasActiveProviderSession = sql<boolean>`exists (
          select 1 from ${sessions}
          where ${sessions.id} = ${sandboxMeteringLeases.sessionId}
            and ${sessions.lifecycleState} = 'active'
            and ${sessions.sandboxState} is not null
        )`;
        await tx
          .update(sandboxMeteringLeases)
          .set({
            state: "running",
            admissionExpiresAt: null,
            updatedAt: params.now,
          })
          .where(
            and(
              eq(sandboxMeteringLeases.userId, params.userId),
              eq(sandboxMeteringLeases.state, "starting"),
              lte(sandboxMeteringLeases.admissionExpiresAt, params.now),
              hasActiveProviderSession,
            ),
          );
        await tx
          .delete(sandboxMeteringLeases)
          .where(
            and(
              eq(sandboxMeteringLeases.userId, params.userId),
              eq(sandboxMeteringLeases.state, "starting"),
              lte(sandboxMeteringLeases.admissionExpiresAt, params.now),
              sql`not (${hasActiveProviderSession})`,
            ),
          );

        const [existingLease] = await tx
          .select({
            sessionId: sandboxMeteringLeases.sessionId,
            usagePeriodId: sandboxMeteringLeases.usagePeriodId,
            state: sandboxMeteringLeases.state,
          })
          .from(sandboxMeteringLeases)
          .where(eq(sandboxMeteringLeases.sessionId, params.sessionId))
          .limit(1)
          .for("update");

        if (existingLease && existingLease.usagePeriodId !== period.id) {
          const [oldPeriod] = await tx
            .select()
            .from(sandboxUsagePeriods)
            .where(eq(sandboxUsagePeriods.id, existingLease.usagePeriodId))
            .limit(1)
            .for("update");
          if (oldPeriod) {
            const [{ count }] = await tx
              .select({ count: sql<number>`count(*)::integer` })
              .from(sandboxMeteringLeases)
              .where(
                and(
                  eq(sandboxMeteringLeases.usagePeriodId, oldPeriod.id),
                  eq(sandboxMeteringLeases.state, "running"),
                ),
              );
            const oldRunningCount = count ?? 0;
            const oldConsumedMilliseconds = accrueRunningSandboxMilliseconds({
              consumedMilliseconds: oldPeriod.consumedMilliseconds,
              runningSandboxCount: oldRunningCount,
              lastMeteredAt: oldPeriod.lastMeteredAt,
              now: params.now,
              periodEnd: oldPeriod.periodEnd,
            });
            await tx
              .update(sandboxUsagePeriods)
              .set({
                consumedMilliseconds: oldConsumedMilliseconds,
                runningSandboxCount: Math.max(
                  0,
                  oldRunningCount - (existingLease.state === "running" ? 1 : 0),
                ),
                lastMeteredAt: new Date(
                  Math.max(
                    oldPeriod.lastMeteredAt?.getTime() ?? 0,
                    params.now.getTime(),
                  ),
                ),
                revision: oldPeriod.revision + 1,
                updatedAt: params.now,
              })
              .where(eq(sandboxUsagePeriods.id, oldPeriod.id));
          }
          await tx
            .delete(sandboxMeteringLeases)
            .where(eq(sandboxMeteringLeases.sessionId, params.sessionId));
        }

        const existingInCurrentPeriod =
          existingLease?.usagePeriodId === period.id ? existingLease : null;
        const [[periodLeases], [allUserLeases]] = await Promise.all([
          tx
            .select({ count: sql<number>`count(*)::integer` })
            .from(sandboxMeteringLeases)
            .where(
              and(
                eq(sandboxMeteringLeases.usagePeriodId, period.id),
                eq(sandboxMeteringLeases.state, "running"),
              ),
            ),
          tx
            .select({ count: sql<number>`count(*)::integer` })
            .from(sandboxMeteringLeases)
            .where(eq(sandboxMeteringLeases.userId, params.userId)),
        ]);
        const periodRunningCount = periodLeases?.count ?? 0;
        const userRunningCount = allUserLeases?.count ?? 0;
        const consumedMilliseconds = accrueRunningSandboxMilliseconds({
          consumedMilliseconds: period.consumedMilliseconds,
          runningSandboxCount: periodRunningCount,
          lastMeteredAt: period.lastMeteredAt,
          now: params.now,
          periodEnd: period.periodEnd,
        });
        await tx
          .update(sandboxUsagePeriods)
          .set({
            consumedMilliseconds,
            runningSandboxCount: periodRunningCount,
            lastMeteredAt: new Date(
              Math.max(
                period.lastMeteredAt?.getTime() ?? 0,
                params.now.getTime(),
              ),
            ),
            revision: period.revision + 1,
            updatedAt: params.now,
          })
          .where(eq(sandboxUsagePeriods.id, period.id));

        const decision = evaluateSandboxAccess({
          kind: "sandbox",
          operation: params.operation,
          now: params.now,
          byokCredentialState: params.access.byokCredentialState,
          subscription: params.access.subscription,
          usage: {
            byokPeriodConsumedMilliseconds:
              preliminary.tier === "byok" ? consumedMilliseconds : 0,
            proPeriodConsumedMilliseconds:
              preliminary.tier === "pro" ? consumedMilliseconds : 0,
            runningSandboxCount: Math.max(
              0,
              userRunningCount - (existingInCurrentPeriod ? 1 : 0),
            ),
          },
        });
        if (!decision.allowed) {
          if (existingInCurrentPeriod) {
            await tx
              .delete(sandboxMeteringLeases)
              .where(eq(sandboxMeteringLeases.sessionId, params.sessionId));
            if (existingInCurrentPeriod.state === "running") {
              await tx
                .update(sandboxUsagePeriods)
                .set({
                  runningSandboxCount: Math.max(0, periodRunningCount - 1),
                  updatedAt: params.now,
                })
                .where(eq(sandboxUsagePeriods.id, period.id));
            }
          }
          return decision;
        }

        if (existingInCurrentPeriod) {
          return {
            allowed: true,
            state: stateFrom({
              tier: decision.tier,
              consumedMilliseconds,
              allowanceMilliseconds: decision.allowanceMilliseconds,
              concurrencyLimit: decision.concurrencyLimit,
              runningSandboxCount: userRunningCount,
              resetAt: decision.period.end,
            }),
          };
        }

        await tx.insert(sandboxMeteringLeases).values({
          sessionId: params.sessionId,
          userId: params.userId,
          usagePeriodId: period.id,
          state: existingLease?.state ?? "starting",
          startedAt: params.now,
          admissionExpiresAt:
            existingLease?.state === "running"
              ? null
              : new Date(params.now.getTime() + SANDBOX_STARTING_LEASE_TTL_MS),
          updatedAt: params.now,
        });

        return {
          allowed: true,
          state: stateFrom({
            tier: decision.tier,
            consumedMilliseconds,
            allowanceMilliseconds: decision.allowanceMilliseconds,
            concurrencyLimit: decision.concurrencyLimit,
            runningSandboxCount: userRunningCount + 1,
            resetAt: decision.period.end,
          }),
        };
      });
    },
    async confirm(sessionId, now) {
      await database.transaction(async (tx) => {
        const [lease] = await tx
          .select({
            usagePeriodId: sandboxMeteringLeases.usagePeriodId,
            state: sandboxMeteringLeases.state,
          })
          .from(sandboxMeteringLeases)
          .where(eq(sandboxMeteringLeases.sessionId, sessionId))
          .limit(1)
          .for("update");
        if (!lease || lease.state === "running") return;

        const [period] = await tx
          .select()
          .from(sandboxUsagePeriods)
          .where(eq(sandboxUsagePeriods.id, lease.usagePeriodId))
          .limit(1)
          .for("update");
        if (!period) return;
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(sandboxMeteringLeases)
          .where(
            and(
              eq(sandboxMeteringLeases.usagePeriodId, period.id),
              eq(sandboxMeteringLeases.state, "running"),
            ),
          );
        const runningCount = count ?? 0;
        const consumedMilliseconds = accrueRunningSandboxMilliseconds({
          consumedMilliseconds: period.consumedMilliseconds,
          runningSandboxCount: runningCount,
          lastMeteredAt: period.lastMeteredAt,
          now,
          periodEnd: period.periodEnd,
        });

        await tx
          .update(sandboxMeteringLeases)
          .set({
            state: "running",
            admissionExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(sandboxMeteringLeases.sessionId, sessionId));
        await tx
          .update(sandboxUsagePeriods)
          .set({
            consumedMilliseconds,
            runningSandboxCount: runningCount + 1,
            lastMeteredAt: new Date(
              Math.max(period.lastMeteredAt?.getTime() ?? 0, now.getTime()),
            ),
            revision: period.revision + 1,
            updatedAt: now,
          })
          .where(eq(sandboxUsagePeriods.id, period.id));
      });
    },
    async release(sessionId, now) {
      await settleLease(sessionId, now, true);
    },
    async meter(sessionId, now) {
      await settleLease(sessionId, now, false);
    },
  };
}

const productionService = createSandboxAllowanceService({
  loadAccessState: loadSandboxAccessState,
  store: createSandboxAllowanceStore(),
});

export async function admitSandboxOperation(params: {
  userId: string;
  sessionId: string;
  operation: "create" | "resume";
}): Promise<SandboxAllowanceState> {
  const admission = await productionService.admit(params);
  if (!admission.allowed) {
    throw new SandboxAccessDeniedError(admission.failure);
  }
  return admission.state;
}

export const confirmSandboxRunning = (sessionId: string) =>
  productionService.confirm(sessionId);
export const releaseSandboxRunning = (sessionId: string) =>
  productionService.release(sessionId);
export async function meterSandboxRunning(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) return;
  const admission = await productionService.admit({
    userId: session.userId,
    sessionId,
    operation: "resume",
  });
  if (!admission.allowed) {
    throw new SandboxAccessDeniedError(admission.failure);
  }
  await productionService.meter(sessionId);
}

export function toSandboxAccessErrorResponse(
  error: SandboxAccessDeniedError,
): Response {
  return Response.json(
    {
      error: {
        code: error.failure.code,
        remediation: error.failure.remediation,
        resetAt: error.failure.resetAt?.toISOString() ?? null,
        ...(error.failure.allowanceState
          ? {
              allowanceState: serializeExhaustedAllowanceState(
                error.failure.allowanceState,
              ),
            }
          : {}),
      },
    },
    { status: 403 },
  );
}
