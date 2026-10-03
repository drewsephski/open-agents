import { beforeEach, expect, mock, test } from "bun:test";
import { FatalError } from "workflow";

mock.module("server-only", () => ({}));
class SandboxAccessDeniedError extends Error {
  override name = "SandboxAccessDeniedError";
  failure = { code: "inference_source_required", remediation: ["add_byok"] };
}
const updates: unknown[] = [];
const cleared: string[][] = [];
let denial: Error | null = null;

mock.module("workflow", () => ({
  FatalError,
  getWorkflowMetadata: () => ({ workflowRunId: "run-1" }),
}));
mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => ({ sandboxProvisioningRunId: "run-1" }),
  claimSessionSandboxProvisioningRunId: async () => true,
  clearSessionSandboxProvisioningRunIdIfOwned: async (...args: string[]) => {
    cleared.push(args);
  },
  updateSession: async (_sessionId: string, update: unknown) => {
    updates.push(update);
  },
}));
mock.module("@/lib/sandbox/allowance", () => ({ SandboxAccessDeniedError }));
mock.module("@/lib/sandbox/provisioning", () => ({
  SessionArchivedDuringProvisioningError: RangeError,
  provisionSessionSandbox: async () => {
    if (denial) throw denial;
    return { sandboxState: { type: "vercel" } };
  },
}));

const { sandboxProvisioningWorkflow } = await import("./sandbox-provisioning");

beforeEach(() => {
  updates.length = 0;
  cleared.length = 0;
  denial = null;
});

test("persists actionable access denials and stops workflow retries", async () => {
  denial = new SandboxAccessDeniedError("Sandbox access denied");
  await expect(sandboxProvisioningWorkflow("session-1")).rejects.toBeInstanceOf(
    FatalError,
  );
  expect(updates).toEqual([
    {
      lifecycleState: "failed",
      lifecycleError:
        "Add an OpenRouter API key in Connections or activate Pro before starting a task.",
    },
  ]);
  expect(cleared).toEqual([["session-1", "run-1"]]);
});

test("clears the provisioning lease after success", async () => {
  expect(await sandboxProvisioningWorkflow("session-1")).toEqual({
    skipped: false,
    sandboxState: { type: "vercel" },
  });
  expect(updates).toHaveLength(0);
  expect(cleared).toEqual([["session-1", "run-1"]]);
});
