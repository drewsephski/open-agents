/**
 * Opt-in CodeSandbox compatibility probe. This is intentionally excluded from
 * CI because it consumes provider quota and requires an external credential.
 */
import {
  connectSandbox,
  type Sandbox,
  type SandboxState,
} from "../packages/sandbox/index.ts";

const apiKey = process.env.CSB_API_KEY;
if (!apiKey) {
  console.log("SKIP: CSB_API_KEY is not configured.");
  process.exit(0);
}

const repo =
  process.env.CODESANDBOX_PROBE_REPO ??
  "https://github.com/drewsephski/open-agents.git";
const githubToken = process.env.GITHUB_TOKEN;
const testCommand =
  process.env.CODESANDBOX_PROBE_TEST_COMMAND ??
  "bun test packages/sandbox/git.test.ts";
const options = {
  githubToken,
  gitUser: {
    name: "Open Agents compatibility probe",
    email: "probe@users.noreply.github.com",
  },
  timeout: 30 * 60 * 1000,
  hibernationTimeoutMs: 10 * 60 * 1000,
  ports: [3000],
  providerOptions: {
    codesandbox: {
      apiKey,
      ...(process.env.CODESANDBOX_TEMPLATE_ID
        ? { templateId: process.env.CODESANDBOX_TEMPLATE_ID }
        : {}),
    },
  },
} as const;

async function execOrThrow(
  sandbox: Sandbox,
  command: string,
  timeoutMs: number,
) {
  const result = await sandbox.exec(
    command,
    sandbox.workingDirectory,
    timeoutMs,
  );
  if (!result.success) {
    throw new Error(
      `Command failed: ${command}\n${result.stderr || result.stdout}`,
    );
  }
  return result;
}

async function assertCredentialCleanup(sandbox: Sandbox) {
  const result = await execOrThrow(
    sandbox,
    "test -z \"$(find /tmp -maxdepth 1 -name 'launchstack-git-auth-*' -print -quit)\"",
    10_000,
  );
  if (!result.success) {
    throw new Error("Scoped GitHub credentials remained in the sandbox");
  }
}

async function main() {
  let sandbox: Sandbox | undefined;
  let resumed: Sandbox | undefined;
  try {
    console.log(`Creating CodeSandbox and cloning ${repo}...`);
    sandbox = await connectSandbox(
      {
        type: "codesandbox",
        source: { repo },
      },
      options,
    );
    await assertCredentialCleanup(sandbox);

    console.log("Running pnpm install...");
    await execOrThrow(
      sandbox,
      "pnpm install --frozen-lockfile",
      15 * 60 * 1000,
    );
    console.log(`Running Bun compatibility command: ${testCommand}`);
    await execOrThrow(sandbox, testCommand, 10 * 60 * 1000);

    if (!sandbox.execDetached || !sandbox.domain) {
      throw new Error(
        "CodeSandbox adapter is missing detached preview support",
      );
    }
    console.log("Starting detached Next.js preview...");
    await sandbox.execDetached(
      "pnpm --dir apps/web dev --hostname 0.0.0.0",
      sandbox.workingDirectory,
    );
    await execOrThrow(
      sandbox,
      "for i in $(seq 1 60); do curl -fsS http://127.0.0.1:3000 >/dev/null && exit 0; sleep 2; done; exit 1",
      125_000,
    );
    console.log(`Preview URL: ${sandbox.domain(3000)}`);

    const state = sandbox.getState?.();
    if (!state || typeof state !== "object" || !("type" in state)) {
      throw new Error("CodeSandbox adapter did not return restorable state");
    }
    await sandbox.stop();
    sandbox = undefined;
    console.log("Sandbox hibernated; resuming from persisted state...");

    resumed = await connectSandbox(state as SandboxState, options);
    await execOrThrow(resumed, "pwd", 30_000);
    await assertCredentialCleanup(resumed);
    console.log(
      "PASS: clone, pnpm, Bun, preview, cleanup, hibernate, and resume.",
    );
  } finally {
    await resumed?.stop().catch(() => {});
    await sandbox?.stop().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
