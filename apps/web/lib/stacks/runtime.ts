import type { AgentModelSelection } from "@open-agents/agent";
import type { StackConfiguration } from "./schema";

export function toStackModelSelection(
  model: NonNullable<StackConfiguration["model"]>,
): AgentModelSelection {
  return {
    id: model.id as AgentModelSelection["id"],
    ...(model.providerOptionsOverrides
      ? { providerOptionsOverrides: model.providerOptionsOverrides }
      : {}),
  };
}
