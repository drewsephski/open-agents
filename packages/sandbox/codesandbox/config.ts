import type { SandboxHooks } from "../interface.ts";
import type { Source } from "../types.ts";

export interface CodeSandboxCredentials {
  apiKey: string;
  templateId?: string;
}

export interface CodeSandboxConnectOptions {
  credentials: CodeSandboxCredentials;
  source?: Source;
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  hibernationTimeoutMs?: number;
  ports?: number[];
  resume?: boolean;
}
