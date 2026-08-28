import type { Sandbox } from "../interface.ts";
import type { ConnectOptions } from "../factory.ts";
import { CodeSandboxSandbox } from "./sandbox.ts";
import type { CodeSandboxState } from "./state.ts";

function getSandboxId(state: CodeSandboxState): string | undefined {
  if (state.restore?.kind === "hibernate") {
    return state.restore.sandboxId;
  }
  return state.providerSandboxId ?? state.sandboxId;
}

export async function connectCodeSandbox(
  state: CodeSandboxState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  const configuredCredentials = options?.providerOptions?.codesandbox;
  const apiKey = configuredCredentials?.apiKey ?? process.env.CSB_API_KEY;
  if (!apiKey) {
    throw new Error("CodeSandbox is not configured: missing CSB_API_KEY");
  }
  const credentials = {
    apiKey,
    ...(configuredCredentials?.templateId
      ? { templateId: configuredCredentials.templateId }
      : process.env.CODESANDBOX_TEMPLATE_ID
        ? { templateId: process.env.CODESANDBOX_TEMPLATE_ID }
        : {}),
  };

  const sandboxId = getSandboxId(state);
  const config = {
    credentials,
    source: state.source,
    env: options?.env,
    githubToken: options?.githubToken,
    gitUser: options?.gitUser,
    hooks: options?.hooks,
    timeout: options?.timeout,
    hibernationTimeoutMs: options?.hibernationTimeoutMs,
    ports: options?.ports,
    resume: options?.resume,
  };

  if (sandboxId) {
    return CodeSandboxSandbox.connect(sandboxId, state, config);
  }

  return CodeSandboxSandbox.create(config);
}
