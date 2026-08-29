import "server-only";

import type {
  InferenceAccountingCallbacks,
  InferenceAccountingResult,
} from "@open-agents/agent";
import { modelCostUsdToMicros } from "@open-agents/agent";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
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
  markMissingCost(callId: string, now: Date): Promise<void>;
}

export class ManagedInferenceCostMetadataError extends Error {
  constructor() {
    super("managed_inference_cost_missing");
    this.name = "ManagedInferenceCostMetadataError";
  }
}

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
    return {
      callId,
      source: params.source,
      callbacks: {
        reconcile: async (result) => {
          if (settled) return;
          if (params.source === "managed" && !result.cost) {
            settled = true;
            await dependencies.store.markMissingCost(callId, now());
            throw new ManagedInferenceCostMetadataError();
          }
          if (!result.cost) {
            return;
          }
          settled = true;
          await dependencies.store.reconcile({
            callId,
            userId: params.userId,
            modelId: params.modelId,
            source: params.source,
            agentType: params.agentType ?? "main",
            result,
            occurredAt: startedAt,
            now: now(),
          });
        },
        fail: async () => {
          if (settled || params.source !== "managed") return;
          settled = true;
          await dependencies.store.markMissingCost(callId, now());
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
                eq(inferenceCallReservations.state, "pending"),
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
            createdAt: params.occurredAt,
          })
          .onConflictDoNothing({ target: usageEvents.id });
      });
    },

    async markMissingCost(callId, completedAt) {
      await database
        .update(inferenceCallReservations)
        .set({ state: "missing_cost", completedAt })
        .where(
          and(
            eq(inferenceCallReservations.id, callId),
            eq(inferenceCallReservations.state, "pending"),
          ),
        );
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
