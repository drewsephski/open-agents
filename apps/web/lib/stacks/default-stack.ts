import type { ExecutionBackend } from "@/lib/access/execution-backend";
import type { UserPreferencesData } from "@/lib/db/user-preferences";
import { resolveChatModelSelection } from "@/lib/model-selection";
import { getAllVariants } from "@/lib/model-variants";
import {
  stackConfigurationSchema,
  stackModelSchema,
  type StackConfiguration,
} from "./schema";

export function buildDefaultStack(
  preferences: UserPreferencesData,
  backend: ExecutionBackend,
): StackConfiguration {
  const native = backend === "launchstack_native";
  const modelVariants = getAllVariants(preferences.modelVariants);
  const resolveModel = (id: string) =>
    stackModelSchema.parse({
      ...resolveChatModelSelection({
        selectedModelId: id,
        modelVariants,
        missingVariantLabel: "Stack model",
      }),
      ...(id.startsWith("variant:") ? { selectedId: id } : {}),
    });
  return stackConfigurationSchema.parse({
    schemaVersion: 1,
    executionBackend: backend,
    model: native ? resolveModel(preferences.defaultModelId) : null,
    subagentModel:
      native && preferences.defaultSubagentModelId
        ? resolveModel(preferences.defaultSubagentModelId)
        : null,
    sandboxType: preferences.defaultSandboxType,
    missionType: "ship_feature",
    instructions: "",
    globalSkillRefs: preferences.globalSkillRefs,
    autoCommitPush: native && preferences.autoCommitPush,
    autoCreatePr:
      native && preferences.autoCommitPush && preferences.autoCreatePr,
    actions: {
      capabilities: native ? [{ toolkit: "gmail", access: "read_write" }] : [],
      policy: { read: "automatic", write: "approval", destructive: "denied" },
    },
  });
}
