import type { Source } from "../types.ts";

/**
 * State configuration for creating, reconnecting, or restoring the current cloud sandbox provider.
 * Used with the unified `connectSandbox()` API.
 */
export interface VercelState {
  /** Current provider runtime identifier for observability and reconciliation. */
  providerSandboxId?: string;
  /** Where to clone from (omit for empty sandbox or when reconnecting/restoring) */
  source?: Source;
  /** Durable persistent sandbox name used for reconnecting/resuming sessions */
  sandboxName?: string;
  /**
   * Legacy runtime sandbox ID from the stable SDK.
   * Kept only as a compatibility fallback during rollout.
   */
  sandboxId?: string;
  /** Snapshot ID used only for legacy restore/migration flows */
  snapshotId?: string;
  /** Provider-specific durable restore metadata. */
  restore?:
    | { kind: "named"; sandboxName: string }
    | { kind: "snapshot"; snapshotId: string };
  /** Timestamp (ms) when the current runtime session expires */
  expiresAt?: number;
}
