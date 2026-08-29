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
import type { AccessDenied, AccessFailure } from "./access-failure";
import {
  evaluateInferenceAccess,
  type InferenceAccessDecision,
} from "./access-policy";
import type {
  CredentialState,
  InferenceSource,
  ManagedKeyState,
} from "./inference-source";
import type { AllowancePeriod } from "./allowance-period";
import type { SubscriptionAccessState } from "./subscription-state";

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
    envelope: CredentialEnvelope | null;
  };
}

export interface ResolvedModelCredential {
  allowed: true;
  source: InferenceSource;
  modelId: string;
  openRouter: OpenRouterConfig;
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
      return {
        allowed: true,
        source: decision.source,
        modelId: decision.modelId,
        openRouter: { apiKey },
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

export async function requireModelCredential(params: {
  userId: string;
  modelId: string;
}): Promise<ResolvedModelCredential> {
  const resolution = await resolveModelCredential(params);
  if (!resolution.allowed) {
    throw new InferenceAccessDeniedError(resolution.failure);
  }
  return resolution;
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
      },
    },
    { status: 403 },
  );
}
