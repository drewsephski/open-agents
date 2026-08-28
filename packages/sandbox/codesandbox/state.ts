import type { Source } from "../types.ts";

export interface CodeSandboxState {
  type: "codesandbox";
  /** Where to clone from when provisioning a new sandbox. */
  source?: Source;
  /** Current and durable CodeSandbox sandbox identifier. */
  providerSandboxId?: string;
  /** Compatibility alias for early fallback deployments. */
  sandboxId?: string;
  /** CodeSandbox resumes a hibernated VM by its sandbox identifier. */
  restore?: { kind: "hibernate"; sandboxId: string };
  /** Server-authoritative lifecycle deadline for this runtime session. */
  expiresAt?: number;
  /** Branch prepared during initial repository setup. */
  currentBranch?: string;
  /** Runtime PATH captured after honoring exact repository toolchain pins. */
  runtime?: { commandPath: string };
}
