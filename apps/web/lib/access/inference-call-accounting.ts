import "server-only";

import type {
  InferenceAccountingCallbacks,
  InferenceAccountingFailureReason,
  InferenceAccountingResult,
} from "@open-agents/agent";
import { modelCostUsdToMicros } from "@open-agents/agent";
import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  inferenceCallReservations,
  managedInferenceKeys,
  usageEvents,
} from "@/lib/db/schema";
import { MANAGED_INFERENCE_ALLOWANCE_MICROS } from "./allowance-period";
import type { InferenceSource } from "./inference-source";
import type { AllowancePeriod } from "./allowance-period";

export interface InferenceCallAdmission {
  callId: string;
  source: Extract<InferenceSource, "byok" | "managed">;
  callbacks: InferenceAccountingCallbacks;
}

export interface InferenceCallAccountingStore {
  reserveManaged(params: {
    callId: string;
    userId: string;
    modelId: string;
    period: AllowancePeriod;
    now: Date;
  }): Promise<boolean>;
  reconcile(params: {
    callId: string;
    userId: string;
    modelId: string;
    source: Extract<InferenceSource, "byok" | "managed">;
    agentType: "main" | "subagent";
    result: InferenceAccountingResult;
    occurredAt: Date;
    now: Date;
  }): Promise<void>;
  recordFailedAccounting(params: {
    callId: string;
    userId: string;
    modelId: string;
    source: Extract<InferenceSource, "byok" | "managed">;
    agentType: "main" | "subagent";
    reason: InferenceAccountingFailureReason | "missing_cost";
    usage?: InferenceAccountingResult["usage"];
    occurredAt: Date;
    now: Date;
  }): Promise<void>;
}

export class InferenceCostMetadataError extends Error {
  readonly source: "byok" | "managed";

  constructor(source: "byok" | "managed") {
    super("inference_cost_missing");
    this.name = "InferenceCostMetadataError";
    this.source = source;
  }
}

export const INFERENCE_RESERVATION_TTL_MS = 60 * 60 * 1000;

export function createInferenceCallAccountingService(dependencies: {
  store: InferenceCallAccountingStore;
  now?: () => Date;
  createId?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? nanoid;

  return async (params: {
    userId: string;
    modelId: string;
    source: Extract<InferenceSource, "byok" | "managed">;
    agentType?: "main" | "subagent";
    period: AllowancePeriod | null;
  }): Promise<InferenceCallAdmission | null> => {
    const callId = createId();
    const startedAt = now();
    if (params.source === "managed") {
      if (!params.period) {
        return null;
      }
      const reserved = await dependencies.store.reserveManaged({
        callId,
        userId: params.userId,
        modelId: params.modelId,
        period: params.period,
        now: startedAt,
      });
      if (!reserved) {
        return null;
      }
    }

    let settled = false;
    let settlement: Promise<void> | null = null;
    const settle = async (operation: () => Promise<void>) => {
      if (settled) return;
      if (settlement) return settlement;
      settlement = operation()
        .then(() => {
          settled = true;
        })
        .finally(() => {
          if (!settled) settlement = null;
        });
      return settlement;
    };
    const recordFailure = (
      reason: InferenceAccountingFailureReason | "missing_cost",
      usage?: InferenceAccountingResult["usage"],
    ) =>
      settle(() =>
        dependencies.store.recordFailedAccounting({
          callId,
          userId: params.userId,
          modelId: params.modelId,
          source: params.source,
          agentType: params.agentType ?? "main",
          reason,
          usage,
          occurredAt: startedAt,
          now: now(),
        }),
      );
    return {
      callId,
      source: params.source,
      callbacks: {
        reconcile: async (result) => {
          if (!result.cost) {
            await recordFailure("missing_cost", result.usage);
            throw new InferenceCostMetadataError(params.source);
          }
          await settle(() =>
            dependencies.store.reconcile({
              callId,
              userId: params.userId,
              modelId: params.modelId,
              source: params.source,
              agentType: params.agentType ?? "main",
              result,
              occurredAt: startedAt,
              now: now(),
            }),
          );
        },
        fail: async (reason) => {
          await recordFailure(reason);
        },
      },
    };
  };
}

function usdToMicrosCeil(rawUsd: string): number {
  const micros = modelCostUsdToMicros(rawUsd);
  if (micros === undefined) {
    throw new Error("Managed inference spend is invalid");
  }
  return micros;
}

export function createInferenceCallAccountingStore(
  database: typeof db = db,
): InferenceCallAccountingStore {
  return {
    async reserveManaged(params) {
      return database.transaction(async (tx) => {
        const [key] = await tx
          .select({ id: managedInferenceKeys.id })
          .from(managedInferenceKeys)
          .where(
            and(
              eq(managedInferenceKeys.userId, params.userId),
              eq(managedInferenceKeys.lifecycleState, "active"),
              eq(managedInferenceKeys.periodStart, params.period.start),
              eq(managedInferenceKeys.periodEnd, params.period.end),
            ),
          )
          .limit(1)
          .for("update");
        if (!key) return false;

        await tx
          .update(inferenceCallReservations)
          .set({ state: "abandoned", completedAt: params.now })
          .where(
            and(
              eq(inferenceCallReservations.userId, params.userId),
              eq(inferenceCallReservations.state, "pending"),
              lte(inferenceCallReservations.expiresAt, params.now),
            ),
          );

        const [[spent], [outstanding]] = await Promise.all([
          tx
            .select({
              usd: sql<string>`coalesce(sum(${usageEvents.inferenceCostUsd}), 0)`,
            })
            .from(usageEvents)
            .where(
              and(
                eq(usageEvents.userId, params.userId),
                eq(usageEvents.credentialSource, "managed"),
                gte(usageEvents.createdAt, params.period.start),
                lt(usageEvents.createdAt, params.period.end),
              ),
            ),
          tx
            .select({
              micros: sql<string>`coalesce(sum(${inferenceCallReservations.reservedMicros}), 0)`,
            })
            .from(inferenceCallReservations)
            .where(
              and(
                eq(inferenceCallReservations.userId, params.userId),
                eq(inferenceCallReservations.periodStart, params.period.start),
                eq(inferenceCallReservations.periodEnd, params.period.end),
                inArray(inferenceCallReservations.state, [
                  "pending",
                  "missing_cost",
                ]),
              ),
            ),
        ]);
        const spentMicros = usdToMicrosCeil(spent?.usd ?? "0");
        const outstandingMicros = Number(outstanding?.micros ?? "0");
        const available =
          MANAGED_INFERENCE_ALLOWANCE_MICROS - spentMicros - outstandingMicros;
        if (!Number.isSafeInteger(available) || available <= 0) return false;

        await tx.insert(inferenceCallReservations).values({
          id: params.callId,
          userId: params.userId,
          modelId: params.modelId,
          periodStart: params.period.start,
          periodEnd: params.period.end,
          reservedMicros: available,
          expiresAt: new Date(
            params.now.getTime() + INFERENCE_RESERVATION_TTL_MS,
          ),
          createdAt: params.now,
        });
        return true;
      });
    },

    async reconcile(params) {
      const cost = params.result.cost;
      if (!cost) return;
      const usage = params.result.usage;
      await database.transaction(async (tx) => {
        if (params.source === "managed") {
          const updated = await tx
            .update(inferenceCallReservations)
            .set({
              state: "reconciled",
              actualCostUsd: cost.usd,
              actualCostMicros: cost.micros,
              completedAt: params.now,
            })
            .where(
              and(
                eq(inferenceCallReservations.id, params.callId),
                inArray(inferenceCallReservations.state, [
                  "pending",
                  "abandoned",
                ]),
              ),
            )
            .returning({ id: inferenceCallReservations.id });
          if (updated.length === 0) return;
        }

        await tx
          .insert(usageEvents)
          .values({
            id: params.callId,
            userId: params.userId,
            source: "web",
            agentType: params.agentType,
            provider: "openrouter",
            modelId: params.modelId,
            credentialSource: params.source,
            inferenceCostUsd: cost.usd,
            inputTokens: usage.inputTokens.total ?? 0,
            cachedInputTokens: usage.inputTokens.cacheRead ?? 0,
            outputTokens: usage.outputTokens.total ?? 0,
            accountingStatus: "accounted",
            createdAt: params.occurredAt,
          })
          .onConflictDoNothing({ target: usageEvents.id });
      });
    },

    async recordFailedAccounting(params) {
      await database.transaction(async (tx) => {
        if (params.source === "managed") {
          await tx
            .update(inferenceCallReservations)
            .set({ state: "missing_cost", completedAt: params.now })
            .where(
              and(
                eq(inferenceCallReservations.id, params.callId),
                inArray(inferenceCallReservations.state, [
                  "pending",
                  "abandoned",
                ]),
              ),
            );
        }

        await tx
          .insert(usageEvents)
          .values({
            id: params.callId,
            userId: params.userId,
            source: "web",
            agentType: params.agentType,
            provider: "openrouter",
            modelId: params.modelId,
            credentialSource: params.source,
            accountingStatus: "failed",
            accountingFailureReason: params.reason,
            inputTokens: params.usage?.inputTokens.total ?? 0,
            cachedInputTokens: params.usage?.inputTokens.cacheRead ?? 0,
            outputTokens: params.usage?.outputTokens.total ?? 0,
            createdAt: params.occurredAt,
          })
          .onConflictDoNothing({ target: usageEvents.id });
      });
    },
  };
}

const productionService = createInferenceCallAccountingService({
  store: createInferenceCallAccountingStore(),
});

export async function authorizeInferenceCall(params: {
  userId: string;
  modelId: string;
  source: Extract<InferenceSource, "byok" | "managed">;
  agentType?: "main" | "subagent";
  period: AllowancePeriod | null;
}): Promise<InferenceCallAdmission | null> {
  return productionService(params);
}
