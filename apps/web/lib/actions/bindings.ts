import { z } from "zod";
import { ACTION_TOOLKITS, type ActionToolkit } from "./registry";
import type { ActionProvider } from "./provider";
import type { ActionExecutionScope } from "./scope";

// Provider-safe identifiers only. Never copy provider credential/data objects.
export const connectedAccountIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,200}$/);
export const actionAccountIdsSchema = z.strictObject({
  gmail: connectedAccountIdSchema.optional(),
  linear: connectedAccountIdSchema.optional(),
});
export type ActionAccountIds = z.infer<typeof actionAccountIdsSchema>;
export const actionAccountSchema = z.strictObject({
  accountId: connectedAccountIdSchema,
  // The installed SDK exposes a word identifier; it does not prove an email/workspace.
  label: z.string().min(1).max(200),
});
export type ActionAccount = z.infer<typeof actionAccountSchema>;
export const actionBindingsSchema = z.strictObject({
  gmail: actionAccountSchema.optional(),
  linear: actionAccountSchema.optional(),
});
export type ActionBindings = z.infer<typeof actionBindingsSchema>;

export class ActionBindingError extends Error {
  readonly code = "connection_binding_inactive";
  readonly remediation = "/settings/connections";
  readonly toolkit: ActionToolkit;
  readonly accountId: string;
  constructor(toolkit: ActionToolkit, accountId: string) {
    super(
      `This worker is bound to ${ACTION_TOOLKITS[toolkit].label} account ${accountId}. That connection is no longer active. Reconnect it or launch a new Session with a different account.`,
    );
    this.name = "ActionBindingError";
    this.toolkit = toolkit;
    this.accountId = accountId;
  }
}

/** Freeze identity, not authorization. Run again immediately before every dispatch. */
export async function validateActionAccounts(
  provider: ActionProvider,
  userId: string,
  scope: ActionExecutionScope,
): Promise<void> {
  for (const toolkit of Object.keys(
    scope.connectedAccounts,
  ) as ActionToolkit[]) {
    const accountId = scope.connectedAccounts[toolkit]!;
    const accounts = await provider.listAccounts(userId, toolkit);
    if (!accounts.some((account) => account.accountId === accountId))
      throw new ActionBindingError(toolkit, accountId);
  }
}
