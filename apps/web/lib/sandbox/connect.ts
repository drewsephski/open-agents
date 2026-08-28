import "server-only";

import {
  connectSandbox,
  type ConnectOptions,
  type SandboxState,
} from "@open-agents/sandbox";
import { getConfiguredSandboxOptions } from "./provider-config";
import { emitSandboxTelemetry } from "./telemetry";

/** Exact-provider connect with validated credentials and normalized telemetry. */
export function connectConfiguredSandbox(
  state: SandboxState,
  options: ConnectOptions = {},
) {
  const configured = getConfiguredSandboxOptions();
  return connectSandbox(state, {
    ...configured,
    ...options,
    providerOptions: {
      ...configured.providerOptions,
      ...options.providerOptions,
    },
    telemetry: options.telemetry ?? emitSandboxTelemetry,
  });
}
