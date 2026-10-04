import { z } from "zod";
import { actionCapabilitiesSchema } from "@/lib/actions/registry";
import { isModelDisabled } from "@/lib/model-availability";
import { missionTypeSchema } from "@/lib/missions";
import { providerOptionsSchema } from "@/lib/model-variants";
import { globalSkillRefsSchema } from "@/lib/skills/global-skill-refs";

export const stackModelSchema = z.strictObject({
  // Selection provenance only. Execution uses the resolved id/options below.
  selectedId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .startsWith("variant:")
    .optional(),
  id: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((id) => !isModelDisabled(id), "This model is disabled"),
  providerOptionsOverrides: z
    .record(z.string(), providerOptionsSchema)
    .optional(),
});

// Capabilities can only narrow the server registry. New toolkits require code.
export const stackActionsSchema = z.strictObject({
  capabilities: actionCapabilitiesSchema,
  policy: z.strictObject({
    read: z.literal("automatic"),
    write: z.literal("approval"),
    destructive: z.literal("denied"),
  }),
});

export const stackConfigurationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    executionBackend: z.enum(["launchstack_native", "codex"]),
    model: stackModelSchema.nullable(),
    subagentModel: stackModelSchema.nullable(),
    sandboxType: z.literal("vercel"),
    missionType: missionTypeSchema,
    instructions: z.string().trim().max(12_000),
    globalSkillRefs: globalSkillRefsSchema,
    autoCommitPush: z.boolean(),
    autoCreatePr: z.boolean(),
    actions: stackActionsSchema,
  })
  .superRefine((config, ctx) => {
    if (config.executionBackend === "launchstack_native" && !config.model) {
      ctx.addIssue({
        code: "custom",
        path: ["model"],
        message: "Native Stacks require a model",
      });
    }
    if (
      config.executionBackend === "codex" &&
      (config.model ||
        config.subagentModel ||
        config.actions.capabilities.length ||
        config.autoCommitPush ||
        config.autoCreatePr)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["executionBackend"],
        message:
          "Codex manages its models and currently does not support external actions or automatic delivery",
      });
    }
    if (config.autoCreatePr && !config.autoCommitPush) {
      ctx.addIssue({
        code: "custom",
        path: ["autoCreatePr"],
        message: "Automatic PR creation requires commit and push",
      });
    }
    for (const model of [config.model, config.subagentModel]) {
      if (model?.id.startsWith("variant:") || model?.id === "codex") {
        ctx.addIssue({
          code: "custom",
          path: ["model"],
          message: "Save a resolved model, not a mutable variant reference",
        });
      }
    }
  });

export type StackConfiguration = z.infer<typeof stackConfigurationSchema>;
export type StackActions = z.infer<typeof stackActionsSchema>;

export const stackSnapshotSchema = z.strictObject({
  name: z.string().min(1).max(80),
  version: z.number().int().positive(),
  configuration: stackConfigurationSchema,
});
export type StackSnapshot = z.infer<typeof stackSnapshotSchema>;

export const createStackSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  configuration: stackConfigurationSchema,
});
export const publishStackSchema = createStackSchema.extend({
  expectedVersion: z.number().int().positive(),
});

export interface StackSummary {
  id: string;
  name: string;
  description: string;
  versionId: string;
  version: number;
  configuration: StackConfiguration;
}

export const DEFAULT_STACK_ID = "launchstack-default";

export function readStackSnapshot(value: unknown): StackSnapshot | null {
  // Legacy sessions have no snapshot. Malformed snapshots fail closed.
  return value == null ? null : stackSnapshotSchema.parse(value);
}
