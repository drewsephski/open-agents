import type { LanguageModel } from "ai";
import { z } from "zod";
import type { AgentContext, SubagentModelRuntime } from "../types";

export const subagentModelRuntimeSchema = z.object({
  modelId: z.string().trim().min(1),
  resolveModel: z.custom<SubagentModelRuntime["resolveModel"]>(
    (value) => typeof value === "function",
    "A subagent model resolver is required.",
  ),
});

function getRuntime(experimentalContext: unknown): SubagentModelRuntime {
  if (
    typeof experimentalContext !== "object" ||
    experimentalContext === null ||
    !("subagentModelRuntime" in experimentalContext)
  ) {
    throw new Error("Subagent model authorization is not initialized.");
  }

  return subagentModelRuntimeSchema.parse(
    experimentalContext.subagentModelRuntime,
  );
}

export async function authorizeSubagentStep(
  experimentalContext: unknown,
): Promise<{
  model: LanguageModel;
  experimental_context: AgentContext;
}> {
  const runtime = getRuntime(experimentalContext);
  const model = await runtime.resolveModel();

  return {
    model,
    experimental_context: {
      ...(experimentalContext as AgentContext),
      model,
    },
  };
}
