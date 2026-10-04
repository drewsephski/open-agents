import "server-only";
import { getNewChatBackend } from "@/lib/access/chat-backend";
import { resolveModelCredential } from "@/lib/access/model-credential-resolver";
import { getAccessFailureMessage } from "@/lib/access/access-failure-message";
import { getAccessSummary } from "@/lib/access/access-summary";
import {
  verifyRepoAccess,
  getRepoAccessErrorMessage,
} from "@/lib/github/access";
import { getSandboxProviderConfig } from "@/lib/sandbox/provider-config";
import { getActionProvider } from "@/lib/actions/runtime";
import type { StackConfiguration } from "./schema";
import { calculateLaunchReadiness, type LaunchBlocker } from "./readiness";

export async function getLaunchReadiness(params: {
  userId: string;
  configuration: StackConfiguration;
  accountIds?: unknown;
  repository?: { owner: string; repo: string };
}) {
  return calculateLaunchReadiness({
    ...params,
    provider: getActionProvider(),
    checkPrerequisites: async () => {
      const blockers: LaunchBlocker[] = [];
      const { configuration, userId, repository } = params;
      if (configuration.executionBackend === "codex") {
        if ((await getNewChatBackend(userId)) !== "codex")
          blockers.push({
            code: "codex_required",
            label: "Connect Codex before launching this Stack",
            remediation: "/settings/connections",
          });
      } else if (configuration.executionBackend === "launchstack_native") {
        for (const model of [
          configuration.model,
          configuration.subagentModel,
        ]) {
          if (!model) continue;
          const access = await resolveModelCredential({
            userId,
            modelId: model.id,
          });
          if (!access.allowed)
            blockers.push({
              code: "inference_unavailable",
              label:
                getAccessFailureMessage(access.failure) ??
                "Inference is unavailable",
              reason: access.failure.code,
              remediation: "/settings/connections",
            });
        }
      }
      if (repository) {
        const access = await verifyRepoAccess({
          userId,
          ...repository,
          requiredUserPermission: configuration.autoCommitPush
            ? "write"
            : "read",
        });
        if (!access.ok)
          blockers.push({
            code: "repository_unavailable",
            label: getRepoAccessErrorMessage(access.reason),
            reason: access.reason,
            remediation: "/settings/connections",
          });
      }
      const config = getSandboxProviderConfig();
      if (
        !config.providerOrder.some((id) => config.providerOptions[id]?.enabled)
      )
        blockers.push({
          code: "sandbox_unavailable",
          label: "No sandbox provider is enabled on this deployment",
          remediation: "/settings/connections",
        });
      // Advisory capacity check. Atomic admission remains authoritative at provisioning.
      const summary = await getAccessSummary(
        userId,
        new Date(),
        configuration.model?.id,
        configuration.executionBackend,
      );
      if (
        summary.sandbox.remainingMilliseconds <= 0 ||
        summary.sandbox.runningSandboxCount >= summary.sandbox.concurrencyLimit
      )
        blockers.push({
          code: "sandbox_unavailable",
          label: "Stop another sandbox or check your sandbox allowance",
          remediation: "/settings/billing",
        });
      return blockers;
    },
  });
}
