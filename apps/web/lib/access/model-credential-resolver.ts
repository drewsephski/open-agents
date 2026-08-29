import "server-only";
import type { OpenRouterConfig } from "@open-agents/agent";
import { getBillingCredentialAccessState } from "@/lib/billing/billing-access-state";
import { getManagedModelIds } from "@/lib/billing/managed-model-catalog";
import {
  decryptCredential,
  loadCredentialKeyring,
  type CredentialEnvelope,
} from "@/lib/credentials/envelope-encryption";
import { providerCredentialStore } from "@/lib/credentials/provider-credential-store";
import {
  type AccessDenied,
  type AccessFailure,
  exhaustedAllowanceState,
  serializeExhaustedAllowanceState,
} from "./access-failure";
import {
  evaluateInferenceAccess,
  type InferenceAccessDecision,
} from "./access-policy";
import type {
  CredentialState,
  InferenceSource,
  ManagedKeyState,
} from "./inference-source";
import {
  getAllowanceWarningLevel,
  MANAGED_INFERENCE_ALLOWANCE_MICROS,
  type AllowancePeriod,
  type AllowanceWarningLevel,
} from "./allowance-period";
import type { SubscriptionAccessState } from "./subscription-state";
import type { InferenceCallAdmission } from "./inference-call-accounting";

export interface ModelCredentialAccessState {
  byokCredential: {
    state: CredentialState;
    envelope: CredentialEnvelope | null;
  };
  subscription: SubscriptionAccessState | null;
  managedInference: {
    keyState: ManagedKeyState;
    period: AllowancePeriod | null;
    spentMicros: number;
    reservedMicros: number;
    allowanceMicros?: number;
    warning?: AllowanceWarningLevel;
    envelope: CredentialEnvelope | null;
  };
}

export interface ResolvedModelCredential {
  allowed: true;
  source: InferenceSource;
  modelId: string;
  openRouter: OpenRouterConfig;
  allowanceState?: {
    consumedMicros: number;
    allowanceMicros: number;
    resetAt: Date | null;
    warning: AllowanceWarningLevel;
  };
}

export type ModelCredentialResolution = ResolvedModelCredential | AccessDenied;

export class InferenceAccessDeniedError extends Error {
  readonly failure: AccessFailure;

  constructor(failure: AccessFailure) {
    super(`Inference access denied: ${failure.code}`);
    this.name = "InferenceAccessDeniedError";
    this.failure = failure;
  }
}

interface ModelCredentialResolverDependencies {
  loadAccessState(userId: string): Promise<ModelCredentialAccessState>;
  decrypt(
    envelope: CredentialEnvelope,
    context: { userId: string; source: "byok" | "managed" },
  ): string;
  managedModelIds: readonly string[];
  now?: () => Date;
}

function invalidAccessState(): AccessDenied {
  return {
    allowed: false,
    failure: {
      code: "access_state_invalid",
      remediation: ["retry_later"],
    },
  };
}

function selectEnvelope(
  state: ModelCredentialAccessState,
  source: InferenceSource,
): CredentialEnvelope | null {
  if (source === "byok") {
    return state.byokCredential.envelope;
  }
  if (source === "managed") {
    return state.managedInference.envelope;
  }
  return null;
}

export function createModelCredentialResolver(
  dependencies: ModelCredentialResolverDependencies,
) {
  const now = dependencies.now ?? (() => new Date());

  return async (params: {
    userId: string;
    modelId: string;
  }): Promise<ModelCredentialResolution> => {
    let state: ModelCredentialAccessState;
    try {
      state = await dependencies.loadAccessState(params.userId);
    } catch {
      return invalidAccessState();
    }

    const decision: InferenceAccessDecision = evaluateInferenceAccess({
      kind: "inference",
      now: now(),
      modelId: params.modelId,
      managedModelIds: dependencies.managedModelIds,
      byokCredentialState: state.byokCredential.state,
      subscription: state.subscription,
      managedInference: {
        keyState: state.managedInference.keyState,
        period: state.managedInference.period,
        spentMicros: state.managedInference.spentMicros,
        reservedMicros: state.managedInference.reservedMicros,
      },
    });
    if (!decision.allowed) {
      return decision;
    }

    const envelope = selectEnvelope(state, decision.source);
    if (!envelope || decision.source === "administrative") {
      return invalidAccessState();
    }

    try {
      const apiKey = dependencies.decrypt(envelope, {
        userId: params.userId,
        source: decision.source,
      });
      if (!apiKey.trim()) {
        return invalidAccessState();
      }
      const allowanceMicros =
        state.managedInference.allowanceMicros ??
        MANAGED_INFERENCE_ALLOWANCE_MICROS;
      const consumedMicros =
        state.managedInference.spentMicros +
        state.managedInference.reservedMicros;
      return {
        allowed: true,
        source: decision.source,
        modelId: decision.modelId,
        openRouter: { apiKey },
        ...(decision.source === "managed"
          ? {
              allowanceState: {
                consumedMicros,
                allowanceMicros,
                resetAt: state.managedInference.period?.end ?? null,
                warning:
                  state.managedInference.warning ??
                  getAllowanceWarningLevel(consumedMicros, allowanceMicros),
              },
            }
          : {}),
      };
    } catch {
      return invalidAccessState();
    }
  };
}

async function loadCurrentAccessState(
  userId: string,
): Promise<ModelCredentialAccessState> {
  const [byokCredential, billing] = await Promise.all([
    providerCredentialStore.getForUser(userId),
    getBillingCredentialAccessState(userId),
  ]);

  return {
    byokCredential: {
      state: byokCredential?.validationState ?? "missing",
      envelope: byokCredential,
    },
    subscription: billing.subscription,
    managedInference: billing.managedInference,
  };
}

const productionResolver = createModelCredentialResolver({
  loadAccessState: loadCurrentAccessState,
  decrypt: (envelope, context) =>
    decryptCredential(envelope, {
      keyring: loadCredentialKeyring(),
      userId: context.userId,
      provider: "openrouter",
    }),
  managedModelIds: getManagedModelIds(),
});

export async function resolveModelCredential(params: {
  userId: string;
  modelId: string;
}): Promise<ModelCredentialResolution> {
  return productionResolver(params);
}

interface ModelCallCredentialResolverDependencies {
  resolve(params: {
    userId: string;
    modelId: string;
  }): Promise<ModelCredentialResolution>;
  loadManagedPeriod(userId: string): Promise<AllowancePeriod | null>;
  authorize(params: {
    userId: string;
    modelId: string;
    source: "byok" | "managed";
    agentType?: "main" | "subagent";
    period: AllowancePeriod | null;
  }): Promise<InferenceCallAdmission | null>;
}

export function createModelCallCredentialResolver(
  dependencies: ModelCallCredentialResolverDependencies,
) {
  return async (params: {
    userId: string;
    modelId: string;
    agentType?: "main" | "subagent";
  }): Promise<ResolvedModelCredential> => {
    let resolution = await dependencies.resolve(params);
    if (!resolution.allowed) {
      throw new InferenceAccessDeniedError(resolution.failure);
    }
    if (resolution.source === "administrative") {
      throw new InferenceAccessDeniedError({
        code: "access_state_invalid",
        remediation: ["retry_later"],
      });
    }
    let period: AllowancePeriod | null = null;
    let admission: InferenceCallAdmission | null;
    try {
      if (resolution.source === "managed") {
        period = await dependencies.loadManagedPeriod(params.userId);
      }
      admission = await dependencies.authorize({
        ...params,
        source: resolution.source,
        period,
      });
    } catch {
      throw new InferenceAccessDeniedError({
        code: "access_state_invalid",
        remediation: ["retry_later"],
      });
    }

    if (!admission && resolution.source === "managed") {
      resolution = await dependencies.resolve(params);
      if (!resolution.allowed) {
        throw new InferenceAccessDeniedError(resolution.failure);
      }
      if (resolution.source === "administrative") {
        throw new InferenceAccessDeniedError({
          code: "access_state_invalid",
          remediation: ["retry_later"],
        });
      }
      if (resolution.source === "managed") {
        if (!period) {
          throw new InferenceAccessDeniedError({
            code: "access_state_invalid",
            remediation: ["retry_later"],
          });
        }
        throw new InferenceAccessDeniedError({
          code: "managed_allowance_exhausted",
          remediation: ["add_byok", "wait_for_reset"],
          resetAt: period.end,
          allowanceState: exhaustedAllowanceState({
            period,
            used: MANAGED_INFERENCE_ALLOWANCE_MICROS,
            limit: MANAGED_INFERENCE_ALLOWANCE_MICROS,
          }),
        });
      }
      try {
        admission = await dependencies.authorize({
          ...params,
          source: resolution.source,
          period: null,
        });
      } catch {
        admission = null;
      }
    }

    if (!admission) {
      throw new InferenceAccessDeniedError({
        code: "access_state_invalid",
        remediation: ["retry_later"],
      });
    }

    return {
      ...resolution,
      openRouter: {
        ...resolution.openRouter,
        accounting: admission.callbacks,
      },
    };
  };
}

const productionCallResolver = createModelCallCredentialResolver({
  resolve: resolveModelCredential,
  loadManagedPeriod: async (userId) =>
    (await getBillingCredentialAccessState(userId)).managedInference.period,
  authorize: async (params) => {
    const { authorizeInferenceCall } =
      await import("./inference-call-accounting");
    return authorizeInferenceCall(params);
  },
});

export async function requireModelCredential(params: {
  userId: string;
  modelId: string;
  agentType?: "main" | "subagent";
}): Promise<ResolvedModelCredential> {
  return productionCallResolver(params);
}

export function isInferenceAccessDeniedError(
  error: unknown,
): error is InferenceAccessDeniedError {
  return error instanceof InferenceAccessDeniedError;
}

export function toInferenceAccessErrorResponse(
  failure: AccessFailure,
): Response {
  return Response.json(
    {
      error: {
        code: failure.code,
        remediation: failure.remediation,
        resetAt: failure.resetAt?.toISOString() ?? null,
        ...(failure.allowanceState
          ? {
              allowanceState: serializeExhaustedAllowanceState(
                failure.allowanceState,
              ),
            }
          : {}),
      },
    },
    { status: 403 },
  );
}
