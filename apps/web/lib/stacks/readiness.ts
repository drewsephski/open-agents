import { z } from "zod";
import { ACTION_TOOLKITS, actionToolkitSchema } from "@/lib/actions/registry";
import {
  actionAccountSchema,
  actionBindingsSchema,
  actionAccountIdsSchema,
} from "@/lib/actions/bindings";
import type { ActionProvider } from "@/lib/actions/provider";
import type { StackConfiguration } from "./schema";

export const launchBlockerSchema = z.strictObject({
  code: z.enum([
    "connection_required",
    "account_selection_required",
    "account_unavailable",
    "integration_unavailable",
    "provider_unavailable",
    "backend_unavailable",
    "codex_required",
    "inference_unavailable",
    "repository_unavailable",
    "sandbox_unavailable",
  ]),
  label: z.string(),
  toolkit: actionToolkitSchema.optional(),
  remediation: z.string(),
  reason: z.string().optional(),
});
export type LaunchBlocker = z.infer<typeof launchBlockerSchema>;
export const launchReadinessSchema = z.strictObject({
  ready: z.boolean(),
  runtime: z.strictObject({
    backend: z.string(),
    model: z.string().nullable(),
  }),
  blockers: z.array(launchBlockerSchema),
  bindings: actionBindingsSchema,
  requirements: z.array(
    z.strictObject({
      toolkit: actionToolkitSchema,
      access: z.enum(["read", "read_write"]),
      accounts: z.array(actionAccountSchema),
    }),
  ),
});
export type LaunchReadiness = z.infer<typeof launchReadinessSchema>;

/** Composes server-owned policies; creates no provider runtime or infrastructure. */
export async function calculateLaunchReadiness(params: {
  userId: string;
  configuration: StackConfiguration;
  accountIds?: unknown;
  provider?: ActionProvider;
  checkPrerequisites: () => Promise<LaunchBlocker[]>;
}): Promise<LaunchReadiness> {
  const ids = actionAccountIdsSchema.parse(params.accountIds ?? {});
  const bindings: LaunchReadiness["bindings"] = {};
  const requirements: LaunchReadiness["requirements"] = [];
  const blockers = await params.checkPrerequisites();
  const { configuration, provider } = params;
  if (!["launchstack_native", "codex"].includes(configuration.executionBackend))
    blockers.push({
      code: "backend_unavailable",
      label: "This execution backend is unavailable",
      remediation: "/settings/stacks",
    });
  const capabilities = configuration.actions.capabilities;
  if (
    configuration.executionBackend !== "launchstack_native" &&
    capabilities.length
  )
    blockers.push({
      code: "backend_unavailable",
      label: "External Actions require LaunchStack Native",
      remediation: "/settings/stacks",
    });
  for (const toolkit of ["gmail", "linear"] as const) {
    if (
      ids[toolkit] &&
      !capabilities.some((capability) => capability.toolkit === toolkit)
    )
      blockers.push({
        code: "account_unavailable",
        toolkit,
        label: "Account selection does not match this Stack's capabilities",
        remediation: "/settings/stacks",
      });
  }
  for (const capability of capabilities) {
    const { toolkit } = capability;
    const label = ACTION_TOOLKITS[toolkit].label;
    const remediation = "/settings/connections";
    let accounts: LaunchReadiness["requirements"][number]["accounts"] = [];
    if (!provider) {
      blockers.push({
        code: "integration_unavailable",
        toolkit,
        label: `${label} is not configured on this deployment`,
        remediation,
      });
    } else {
      try {
        // Strict projection ensures a provider cannot leak credential fields into JSON.
        accounts = (await provider.listAccounts(params.userId, toolkit)).map(
          (account) =>
            actionAccountSchema.parse({
              accountId: account.accountId,
              label: account.label,
            }),
        );
        const selectedId = ids[toolkit];
        const selected = selectedId
          ? accounts.find((account) => account.accountId === selectedId)
          : accounts.length === 1
            ? accounts[0]
            : undefined;
        if (selected) bindings[toolkit] = selected;
        else
          blockers.push({
            code: selectedId
              ? "account_unavailable"
              : accounts.length
                ? "account_selection_required"
                : "connection_required",
            toolkit,
            label: selectedId
              ? `${label} account is no longer active`
              : accounts.length
                ? `Choose a ${label} account`
                : `Connect ${label}`,
            remediation,
          });
      } catch {
        blockers.push({
          code: "provider_unavailable",
          toolkit,
          label: `Unable to verify ${label} accounts`,
          remediation,
        });
      }
    }
    requirements.push({ ...capability, accounts });
  }
  return launchReadinessSchema.parse({
    ready: blockers.length === 0,
    runtime: {
      backend: configuration.executionBackend,
      model: configuration.model?.id ?? null,
    },
    blockers,
    bindings,
    requirements,
  });
}
