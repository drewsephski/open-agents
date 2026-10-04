import { createHash } from "node:crypto";
import { z } from "zod";
import { ACTION_REGISTRY, actionIdSchema } from "./registry";
import { connectedAccountIdSchema } from "./bindings";

/** Serializable immutable runtime policy, including exact account selection. */
export const actionExecutionScopeSchema = z
  .strictObject({
    tools: z.array(actionIdSchema).min(1).max(6),
    connectedAccounts: z.strictObject({
      gmail: connectedAccountIdSchema.optional(),
      linear: connectedAccountIdSchema.optional(),
    }),
  })
  .superRefine((scope, ctx) => {
    const toolkits = new Set(
      scope.tools.map((name) => ACTION_REGISTRY[name].toolkit),
    );
    if (
      new Set(scope.tools).size !== scope.tools.length ||
      [...toolkits].some((toolkit) => !scope.connectedAccounts[toolkit]) ||
      Object.keys(scope.connectedAccounts).some(
        (toolkit) => !toolkits.has(toolkit as "gmail" | "linear"),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Execution tools must have exactly their connected accounts",
      });
    }
  });
export type ActionExecutionScope = z.infer<typeof actionExecutionScopeSchema>;

export function normalizeActionScope(
  value: ActionExecutionScope,
): ActionExecutionScope {
  const scope = actionExecutionScopeSchema.parse(value);
  return {
    tools: [...scope.tools].sort(),
    connectedAccounts: {
      ...(scope.connectedAccounts.gmail
        ? { gmail: scope.connectedAccounts.gmail }
        : {}),
      ...(scope.connectedAccounts.linear
        ? { linear: scope.connectedAccounts.linear }
        : {}),
    },
  };
}
export function actionScopeKey(scope: ActionExecutionScope): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizeActionScope(scope)))
    .digest("hex");
}
