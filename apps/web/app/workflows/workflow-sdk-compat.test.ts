import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

type Schema = {
  safeParse(value: unknown): { success: boolean };
};

type WorkflowWorldModule = {
  StepSchema: Schema;
  WorkflowRunSchema: Schema;
};

async function loadWorkflowWorld(): Promise<WorkflowWorldModule> {
  const require = createRequire(import.meta.url);
  const workflowEntry = require.resolve("workflow");
  const workflowRequire = createRequire(workflowEntry);
  const coreEntry = workflowRequire.resolve("@workflow/core");
  const coreRequire = createRequire(coreEntry);
  const worldEntry = coreRequire.resolve("@workflow/world");
  const worldModule: unknown = await import(pathToFileURL(worldEntry).href);

  if (
    typeof worldModule !== "object" ||
    worldModule === null ||
    !("WorkflowRunSchema" in worldModule) ||
    !("StepSchema" in worldModule)
  ) {
    throw new Error("Workflow SDK did not expose its world schemas");
  }

  return worldModule as WorkflowWorldModule;
}

const world = await loadWorkflowWorld();

test("accepts an in-flight run whose input is stored as a remote reference", () => {
  const result = world.WorkflowRunSchema.safeParse({
    runId: "wrun_01M14F80460QSXNQ8KKKDKWXB1",
    status: "running",
    deploymentId: "dpl_test",
    workflowName: "workflow//./app/workflows/chat//chatWorkflow",
    createdAt: "2026-08-28T15:19:05.000Z",
    updatedAt: "2026-08-28T15:19:05.000Z",
  });

  expect(result.success).toBe(true);
});

test("accepts an in-flight step whose input is stored as a remote reference", () => {
  const result = world.StepSchema.safeParse({
    runId: "wrun_01M14F80460QSXNQ8KKKDKWXB1",
    stepId: "step_test",
    stepName:
      "step//./app/workflows/chat-sandbox-runtime//resolveChatSandboxRuntime",
    status: "running",
    attempt: 1,
    createdAt: "2026-08-28T15:19:05.000Z",
    updatedAt: "2026-08-28T15:19:05.000Z",
  });

  expect(result.success).toBe(true);
});
