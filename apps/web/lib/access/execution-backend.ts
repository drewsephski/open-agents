import { z } from "zod";

export const executionBackendSchema = z.enum([
  "launchstack_native",
  "codex",
  "opencode",
]);

export type ExecutionBackend = z.infer<typeof executionBackendSchema>;

export const DEFAULT_EXECUTION_BACKEND: ExecutionBackend = "launchstack_native";
