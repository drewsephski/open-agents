import { FatalError, getWorkflowMetadata } from "workflow";
import { getAccessFailureMessage } from "@/lib/access/access-failure-message";
import {
  claimSessionSandboxProvisioningRunId,
  clearSessionSandboxProvisioningRunIdIfOwned,
  getSessionById,
  updateSession,
} from "@/lib/db/sessions";
import {
  provisionSessionSandbox,
  SessionArchivedDuringProvisioningError,
} from "@/lib/sandbox/provisioning";
import { SandboxAccessDeniedError } from "@/lib/sandbox/allowance";

async function runProvisioning(sessionId: string, runId: string) {
  "use step";

  const session = await getSessionById(sessionId);
  if (!session) {
    return { skipped: true, reason: "session-not-found" };
  }
  if (session.sandboxProvisioningRunId === null) {
    const claimed = await claimSessionSandboxProvisioningRunId(
      sessionId,
      runId,
    );
    if (!claimed) {
      return { skipped: true, reason: "run-replaced" };
    }
  } else if (session.sandboxProvisioningRunId !== runId) {
    return { skipped: true, reason: "run-replaced" };
  }

  try {
    const result = await provisionSessionSandbox({ sessionId });
    await clearSessionSandboxProvisioningRunIdIfOwned(sessionId, runId);
    return {
      skipped: false,
      sandboxState: result.sandboxState,
    };
  } catch (error) {
    if (error instanceof SandboxAccessDeniedError) {
      const message = getAccessFailureMessage(error.failure) ?? error.message;
      await updateSession(sessionId, {
        lifecycleState: "failed",
        lifecycleError: message,
      });
      await clearSessionSandboxProvisioningRunIdIfOwned(sessionId, runId);
      throw new FatalError(message);
    }
    if (error instanceof SessionArchivedDuringProvisioningError) {
      await clearSessionSandboxProvisioningRunIdIfOwned(sessionId, runId);
      return { skipped: true, reason: "session-archived" };
    }

    const message = error instanceof Error ? error.message : String(error);
    await updateSession(sessionId, {
      lifecycleState: "failed",
      lifecycleError: message,
    });
    await clearSessionSandboxProvisioningRunIdIfOwned(sessionId, runId);
    throw error;
  }
}

export async function sandboxProvisioningWorkflow(sessionId: string) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  return runProvisioning(sessionId, workflowRunId);
}
