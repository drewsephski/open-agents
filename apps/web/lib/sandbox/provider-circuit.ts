import "server-only";

import type {
  SandboxCircuitBreaker,
  SandboxProvider,
  SandboxProviderCircuitState,
  SandboxProviderError,
} from "@open-agents/sandbox";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sandboxProviderCircuits } from "@/lib/db/schema";
import { getSandboxProviderConfig } from "./provider-config";
import { emitSandboxTelemetry } from "./telemetry";

const IMMEDIATE_OPEN_CLASSES = new Set([
  "quota_exhausted",
  "account_limit",
  "provider_capacity",
]);

function toState(
  row: typeof sandboxProviderCircuits.$inferSelect | undefined,
  now: Date,
): SandboxProviderCircuitState {
  return {
    isOpen:
      Boolean(row?.openUntil && row.openUntil > now) ||
      Boolean(row?.probeLeaseUntil && row.probeLeaseUntil > now),
    openedUntil:
      row?.openUntil && row.openUntil > now
        ? row.openUntil.getTime()
        : row?.probeLeaseUntil && row.probeLeaseUntil > now
          ? row.probeLeaseUntil.getTime()
          : undefined,
    failureCount: row?.failureCount ?? 0,
  };
}

async function getRow(provider: SandboxProvider) {
  return db.query.sandboxProviderCircuits.findFirst({
    where: eq(sandboxProviderCircuits.provider, provider),
  });
}

export class DatabaseSandboxCircuitBreaker implements SandboxCircuitBreaker {
  async getState(
    provider: SandboxProvider,
  ): Promise<SandboxProviderCircuitState> {
    const now = new Date();
    const config = getSandboxProviderConfig().circuit;
    const row = await getRow(provider);
    if (!row) return { isOpen: false, failureCount: 0 };

    if (row.openUntil && row.openUntil > now) {
      return toState(row, now);
    }
    if (row.probeLeaseUntil && row.probeLeaseUntil > now) {
      return toState(row, now);
    }
    if (!row.openUntil) {
      return toState(row, now);
    }

    const probeLeaseUntil = new Date(now.getTime() + config.probeLeaseMs);
    const [claimed] = await db
      .update(sandboxProviderCircuits)
      .set({
        openUntil: null,
        probeLeaseUntil,
        updatedAt: now,
      })
      .where(
        and(
          eq(sandboxProviderCircuits.provider, provider),
          lte(sandboxProviderCircuits.openUntil, now),
          or(
            isNull(sandboxProviderCircuits.probeLeaseUntil),
            lte(sandboxProviderCircuits.probeLeaseUntil, now),
          ),
        ),
      )
      .returning();

    if (claimed) {
      emitSandboxTelemetry({
        name: "sandbox.provider.circuit",
        provider,
        state: "closed",
        failureCount: claimed.failureCount,
      });
      return { isOpen: false, failureCount: claimed.failureCount };
    }

    const current = await getRow(provider);
    return toState(current, now);
  }

  async recordSuccess(provider: SandboxProvider): Promise<void> {
    const now = new Date();
    await db
      .insert(sandboxProviderCircuits)
      .values({ provider, updatedAt: now })
      .onConflictDoUpdate({
        target: sandboxProviderCircuits.provider,
        set: {
          failureCount: 0,
          failureWindowStartedAt: null,
          openedAt: null,
          openUntil: null,
          probeLeaseUntil: null,
          lastFailureClass: null,
          updatedAt: now,
        },
      });
  }

  async recordFailure(
    provider: SandboxProvider,
    error: SandboxProviderError,
  ): Promise<SandboxProviderCircuitState> {
    const now = new Date();
    const config = getSandboxProviderConfig().circuit;
    const isImmediate = IMMEDIATE_OPEN_CLASSES.has(error.errorClass);
    const countsTransient =
      error.errorClass === "transient_provisioning" && error.retryable;
    if (!isImmediate && !countsTransient) {
      return toState(await getRow(provider), now);
    }

    const windowBoundary = new Date(now.getTime() - config.windowMs);
    const openUntil = new Date(now.getTime() + config.openMs);
    const [row] = await db
      .insert(sandboxProviderCircuits)
      .values({
        provider,
        failureCount: 1,
        failureWindowStartedAt: now,
        openedAt: isImmediate || config.failureThreshold <= 1 ? now : null,
        openUntil:
          isImmediate || config.failureThreshold <= 1 ? openUntil : null,
        probeLeaseUntil: null,
        lastFailureClass: error.errorClass,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sandboxProviderCircuits.provider,
        set: {
          failureCount: sql<number>`case when ${sandboxProviderCircuits.failureWindowStartedAt} is null or ${sandboxProviderCircuits.failureWindowStartedAt} < ${windowBoundary} then 1 else ${sandboxProviderCircuits.failureCount} + 1 end`,
          failureWindowStartedAt: sql<Date>`case when ${sandboxProviderCircuits.failureWindowStartedAt} is null or ${sandboxProviderCircuits.failureWindowStartedAt} < ${windowBoundary} then ${now} else ${sandboxProviderCircuits.failureWindowStartedAt} end`,
          openedAt: isImmediate
            ? now
            : sql<Date | null>`case when (case when ${sandboxProviderCircuits.failureWindowStartedAt} is null or ${sandboxProviderCircuits.failureWindowStartedAt} < ${windowBoundary} then 1 else ${sandboxProviderCircuits.failureCount} + 1 end) >= ${config.failureThreshold} then ${now} else null end`,
          openUntil: isImmediate
            ? openUntil
            : sql<Date | null>`case when (case when ${sandboxProviderCircuits.failureWindowStartedAt} is null or ${sandboxProviderCircuits.failureWindowStartedAt} < ${windowBoundary} then 1 else ${sandboxProviderCircuits.failureCount} + 1 end) >= ${config.failureThreshold} then ${openUntil} else null end`,
          probeLeaseUntil: null,
          lastFailureClass: error.errorClass,
          updatedAt: now,
        },
      })
      .returning();

    const state = toState(row, now);
    if (state.isOpen) {
      emitSandboxTelemetry({
        name: "sandbox.provider.circuit",
        provider,
        state: "open",
        openedUntil: state.openedUntil,
        failureCount: state.failureCount,
      });
    }
    return state;
  }
}

export const sandboxProviderCircuit = new DatabaseSandboxCircuitBreaker();
