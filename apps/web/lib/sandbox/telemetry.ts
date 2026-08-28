import "server-only";

import type { SandboxTelemetry } from "@open-agents/sandbox";

/**
 * Emits only normalized, low-cardinality provider events. Raw errors, source
 * URLs, credentials, and sandbox identifiers are intentionally excluded.
 */
export const emitSandboxTelemetry: SandboxTelemetry = (event) => {
  console.log(
    JSON.stringify({
      event: event.name,
      ...event,
      timestamp: new Date().toISOString(),
    }),
  );
};
