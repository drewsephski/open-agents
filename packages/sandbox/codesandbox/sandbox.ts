import {
  CodeSandbox,
  type Command,
  CommandError,
  type Sandbox as CodeSandboxInstance,
  type SandboxClient,
} from "@codesandbox/sdk";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import type {
  ExecResult,
  Sandbox,
  SandboxStats,
  SnapshotResult,
} from "../interface.ts";
import type { SandboxStatus } from "../types.ts";
import type { CodeSandboxConnectOptions } from "./config.ts";
import { parseRuntimeRequirements } from "./runtime.ts";
import type { CodeSandboxState } from "./state.ts";

const MAX_OUTPUT_LENGTH = 50_000;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_HIBERNATION_TIMEOUT_MS = 30 * 60 * 1000;
const COMMAND_KILL_GRACE_MS = 1_000;
const COMMAND_IO_GRACE_MS = 1_000;
const COMMAND_EXIT_POLL_MS = 250;

function truncateOutput(output: string): {
  output: string;
  truncated: boolean;
} {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return { output, truncated: false };
  }
  return { output: output.slice(0, MAX_OUTPUT_LENGTH), truncated: true };
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toDirent(
  path: string,
  entry: {
    name: string;
    type: "file" | "directory";
    isSymlink: boolean;
  },
): Dirent {
  return {
    name: entry.name,
    parentPath: path,
    path,
    isDirectory: () => entry.type === "directory" && !entry.isSymlink,
    isFile: () => entry.type === "file" && !entry.isSymlink,
    isSymbolicLink: () => entry.isSymlink,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as Dirent;
}

function getAbortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

async function killCommandWithGrace(command: Command): Promise<void> {
  let graceHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      command.kill().catch(() => {}),
      new Promise<void>((resolve) => {
        graceHandle = setTimeout(resolve, COMMAND_KILL_GRACE_MS);
      }),
    ]);
  } finally {
    if (graceHandle) clearTimeout(graceHandle);
  }
}

async function settleWithGrace<T>(
  operation: Promise<T>,
  fallback: T,
): Promise<T> {
  let graceHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.catch(() => fallback),
      new Promise<T>((resolve) => {
        graceHandle = setTimeout(() => resolve(fallback), COMMAND_IO_GRACE_MS);
      }),
    ]);
  } finally {
    if (graceHandle) clearTimeout(graceHandle);
  }
}

async function waitForPollingInterval(timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
}

interface PreparedGitAuth {
  directory: string;
  env: Record<string, string>;
}

export class CodeSandboxSandbox implements Sandbox {
  readonly type = "cloud" as const;
  readonly provider = "codesandbox" as const;
  readonly workingDirectory: string;
  readonly env?: Record<string, string>;
  readonly hooks?: CodeSandboxConnectOptions["hooks"];
  readonly timeout: number;
  readonly ports: number[];

  private readonly authContext = new AsyncLocalStorage<string>();
  private readonly sdk: CodeSandbox;
  private readonly instance: CodeSandboxInstance;
  private readonly client: SandboxClient;
  private currentBranchValue?: string;
  private commandPathValue?: string;
  private expiresAtValue: number;
  private stopped = false;
  private stopPromise?: Promise<void>;

  private constructor(
    sdk: CodeSandbox,
    instance: CodeSandboxInstance,
    client: SandboxClient,
    options: CodeSandboxConnectOptions,
    state?: CodeSandboxState,
  ) {
    this.sdk = sdk;
    this.instance = instance;
    this.client = client;
    this.workingDirectory = client.workspacePath;
    this.env = options.env;
    this.currentBranchValue = state?.currentBranch;
    this.commandPathValue = state?.runtime?.commandPath;
    this.hooks = options.hooks;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.ports = options.ports ?? [];
    const persistedExpiry = state?.expiresAt;
    this.expiresAtValue =
      persistedExpiry && persistedExpiry > Date.now()
        ? persistedExpiry
        : Date.now() + this.timeout;
    this.client.keepActiveWhileConnected(false);
  }

  static async create(
    options: CodeSandboxConnectOptions,
  ): Promise<CodeSandboxSandbox> {
    const sdk = new CodeSandbox(options.credentials.apiKey);
    return CodeSandboxSandbox.createWithSdk(options, sdk);
  }

  /** Dependency-injected creation seam used by deterministic adapter tests. */
  static async createWithSdk(
    options: CodeSandboxConnectOptions,
    sdk: CodeSandbox,
  ): Promise<CodeSandboxSandbox> {
    const hibernationTimeoutMs =
      options.hibernationTimeoutMs ?? DEFAULT_HIBERNATION_TIMEOUT_MS;
    const instance = await sdk.sandboxes.create({
      ...(options.credentials.templateId
        ? { id: options.credentials.templateId }
        : {}),
      privacy: "public-hosts",
      hibernationTimeoutSeconds: Math.max(
        60,
        Math.ceil(hibernationTimeoutMs / 1000),
      ),
      automaticWakeupConfig: { http: false, websocket: false },
      tags: ["sdk", "launchstack"],
    });
    let client: SandboxClient;
    try {
      client = await instance.connect();
    } catch (error) {
      await sdk.sandboxes.shutdown(instance.id).catch(() => {});
      throw error;
    }
    const sandbox = new CodeSandboxSandbox(sdk, instance, client, options);

    try {
      await sandbox.setupWorkspace(options);
      if (options.hooks?.afterStart) {
        await options.hooks.afterStart(sandbox);
      }
      return sandbox;
    } catch (error) {
      await sandbox.destroyFailedProvision().catch((cleanupError) => {
        console.error(
          "[CodeSandbox] Failed to destroy an unsuccessful provision:",
          cleanupError instanceof Error ? cleanupError.message : cleanupError,
        );
      });
      throw error;
    }
  }

  static async connect(
    sandboxId: string,
    state: CodeSandboxState,
    options: CodeSandboxConnectOptions,
  ): Promise<CodeSandboxSandbox> {
    const sdk = new CodeSandbox(options.credentials.apiKey);
    return CodeSandboxSandbox.connectWithSdk(sandboxId, state, options, sdk);
  }

  /** Dependency-injected restore seam used by deterministic adapter tests. */
  static async connectWithSdk(
    sandboxId: string,
    state: CodeSandboxState,
    options: CodeSandboxConnectOptions,
    sdk: CodeSandbox,
  ): Promise<CodeSandboxSandbox> {
    const instance = await sdk.sandboxes.resume(sandboxId);
    if (instance.bootupType === "CLEAN") {
      await sdk.sandboxes.hibernate(sandboxId).catch(() => {});
      throw new Error(
        "CodeSandbox restore lost its hibernation snapshot; refusing a clean boot",
      );
    }
    let client: SandboxClient;
    try {
      client = await instance.connect();
    } catch (error) {
      await sdk.sandboxes.hibernate(sandboxId).catch(() => {});
      throw error;
    }
    const sandbox = new CodeSandboxSandbox(
      sdk,
      instance,
      client,
      options,
      state,
    );
    const hibernationTimeoutMs =
      options.hibernationTimeoutMs ?? DEFAULT_HIBERNATION_TIMEOUT_MS;
    try {
      if (!sandbox.commandPathValue) await sandbox.configureRuntime();
      await instance.updateHibernationTimeout(
        Math.max(60, Math.ceil(hibernationTimeoutMs / 1000)),
      );
      if (options.hooks?.afterStart) {
        await options.hooks.afterStart(sandbox);
      }
      return sandbox;
    } catch (error) {
      await sandbox.stop().catch(() => {});
      throw error;
    }
  }

  private getCommandEnv(
    additionalEnv?: Record<string, string>,
  ): Record<string, string> | undefined {
    const previewEnv = Object.fromEntries(
      this.ports.map((port) => [`SANDBOX_URL_${port}`, this.domain(port)]),
    );
    const merged = {
      ...(this.commandPathValue ? { PATH: this.commandPathValue } : {}),
      ...this.env,
      ...previewEnv,
      ...additionalEnv,
    };
    if (Object.keys(merged).length === 0) return undefined;

    // SDK 2.4 constructs a shell env prefix and does not escape values with
    // spaces itself. Shell-quote each value so the child receives it exactly.
    return Object.fromEntries(
      Object.entries(merged).map(([key, value]) => [key, shellEscape(value)]),
    );
  }

  private async destroyFailedProvision(): Promise<void> {
    this.stopped = true;
    await this.disconnectClient();
    await this.sdk.sandboxes.shutdown(this.instance.id);
  }

  private async disconnectClient(): Promise<void> {
    await this.client.disconnect().catch(() => {});
    try {
      this.client.dispose();
    } catch (error) {
      console.warn(
        "[CodeSandbox] Failed to dispose SDK client:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async prepareGitAuth(): Promise<PreparedGitAuth | undefined> {
    const token = this.authContext.getStore();
    if (!token) return undefined;

    const directory = `/tmp/launchstack-git-auth-${randomUUID()}`;
    const tokenPath = `${directory}/token`;
    const askpassPath = `${directory}/askpass.sh`;
    try {
      await this.client.fs.mkdir(directory, true);
      await this.client.fs.writeTextFile(tokenPath, token);
      await this.client.fs.writeTextFile(
        askpassPath,
        `#!/bin/sh
case "$1" in
  *Username*) printf '%s' 'x-access-token' ;;
  *) cat "$LAUNCHSTACK_GIT_TOKEN_FILE" ;;
esac
`,
      );
      await this.client.commands.run(
        `chmod 700 ${shellEscape(askpassPath)} && chmod 600 ${shellEscape(tokenPath)}`,
      );
    } catch (error) {
      await this.client.fs.remove(directory, true).catch(() => {});
      throw error;
    }
    return {
      directory,
      env: {
        GIT_ASKPASS: askpassPath,
        GIT_TERMINAL_PROMPT: "0",
        LAUNCHSTACK_GIT_AUTH_DIR: directory,
        LAUNCHSTACK_GIT_TOKEN_FILE: tokenPath,
      },
    };
  }

  private async setupWorkspace(
    options: CodeSandboxConnectOptions,
  ): Promise<void> {
    const source = options.source;
    if (source) {
      await this.execOrThrow(
        "find . -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +",
      );
      const cloneArgs = ["git", "clone"];
      if (source.branch) {
        cloneArgs.push("--branch", source.branch);
      }
      cloneArgs.push("--", source.repo, ".");
      const clone = () =>
        this.execOrThrow(cloneArgs.map(shellEscape).join(" "));
      try {
        if (options.githubToken) {
          await this.withGitHubAuth(options.githubToken, clone);
        } else {
          await clone();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to clone repository '${source.repo}': ${message}`,
          { cause: error },
        );
      }
    } else {
      await this.execOrThrow("git init");
    }

    await this.configureRuntime();

    if (options.gitUser) {
      await this.execOrThrow(
        `git config user.name ${shellEscape(options.gitUser.name)}`,
      );
      await this.execOrThrow(
        `git config user.email ${shellEscape(options.gitUser.email)}`,
      );
    }

    if (!source && options.gitUser) {
      await this.execOrThrow("git commit --allow-empty -m 'Initial commit'");
    }

    if (source?.newBranch) {
      await this.execOrThrow(
        `git checkout -b ${shellEscape(source.newBranch)}`,
      );
      this.currentBranchValue = source.newBranch;
    } else if (source?.branch) {
      this.currentBranchValue = source.branch;
    }
  }

  private async configureRuntime(): Promise<void> {
    let packageJson: string;
    try {
      packageJson = await this.client.fs.readTextFile(
        `${this.workingDirectory}/package.json`,
      );
    } catch {
      return;
    }

    const requirements = parseRuntimeRequirements(packageJson);
    if (!requirements.nodeMajor && !requirements.pnpmPackage) return;

    const pathResult = await this.exec(
      'printf "%s" "$PATH"',
      this.workingDirectory,
      10_000,
    );
    if (!pathResult.success || !pathResult.stdout.trim()) {
      throw new Error("CodeSandbox could not read its command PATH");
    }

    if (requirements.nodeMajor) {
      const nodeBootstrap = `set -eu
if [ ! -s /usr/local/share/nvm/nvm.sh ]; then
  echo "CodeSandbox nvm runtime is unavailable" >&2
  exit 1
fi
. /usr/local/share/nvm/nvm.sh
nvm install ${requirements.nodeMajor} >/dev/null
nvm alias default ${requirements.nodeMajor} >/dev/null
printf '__LAUNCHSTACK_NODE_BIN__=%s\\n' "$(dirname "$(nvm which ${requirements.nodeMajor})")"`;
      const nodeResult = await this.exec(
        `bash -lc ${shellEscape(nodeBootstrap)}`,
        this.workingDirectory,
        DEFAULT_TIMEOUT_MS,
      );
      const nodeBin = /__LAUNCHSTACK_NODE_BIN__=([^\r\n]+)/.exec(
        nodeResult.stdout,
      )?.[1];
      if (!nodeResult.success || !nodeBin) {
        throw new Error(
          nodeResult.stderr ||
            "CodeSandbox could not install the repository Node.js runtime",
        );
      }
      this.commandPathValue = `${nodeBin}:${pathResult.stdout.trim()}`;
    }

    if (requirements.pnpmPackage) {
      const pnpmResult = await this.exec(
        `npm install --global --no-audit --no-fund ${shellEscape(requirements.pnpmPackage)}`,
        this.workingDirectory,
        DEFAULT_TIMEOUT_MS,
      );
      if (!pnpmResult.success) {
        throw new Error(
          pnpmResult.stderr ||
            "CodeSandbox could not install the repository pnpm version",
        );
      }
    }
  }

  private async execOrThrow(command: string): Promise<void> {
    const result = await this.exec(
      command,
      this.workingDirectory,
      DEFAULT_TIMEOUT_MS,
    );
    if (!result.success) {
      throw new Error(
        result.stderr || result.stdout || `Command failed: ${command}`,
      );
    }
  }

  get expiresAt(): number | undefined {
    return this.stopped ? undefined : this.expiresAtValue;
  }

  get currentBranch(): string | undefined {
    return this.currentBranchValue;
  }

  get host(): string {
    return `${this.instance.id}.csb.app`;
  }

  get environmentDetails(): string {
    const portLines = this.ports
      .map((port) => `  - Port ${port}: ${this.domain(port)}`)
      .join("\n");
    return `- This cloud workspace is provided by CodeSandbox and is pinned to CodeSandbox for its full lifecycle
- All bash commands already run in the working directory by default; do not prepend \`cd\`
- Use workspace-relative paths for file operations
- GitHub credentials are brokered only for the trusted command that needs them and are never persisted in the workspace
- Node.js, npm, pnpm, Bun, Git, and common development tools are available
- Preview HTTP and WebSocket traffic cannot automatically wake this sandbox; Launchstack resumes it explicitly
${portLines ? `- Dev server preview URLs:\n${portLines}` : ""}`;
  }

  async readFile(path: string, _encoding: "utf-8"): Promise<string> {
    return this.client.fs.readTextFile(path);
  }

  async readFileBuffer(path: string): Promise<Buffer> {
    return Buffer.from(await this.client.fs.readFile(path));
  }

  async writeFile(
    path: string,
    content: string,
    _encoding: "utf-8",
  ): Promise<void> {
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (parent) {
      await this.mkdir(parent, { recursive: true });
    }
    await this.client.fs.writeTextFile(path, content);
  }

  async writeFileBuffer(path: string, content: Buffer): Promise<void> {
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (parent) {
      await this.mkdir(parent, { recursive: true });
    }
    await this.client.fs.writeFile(path, content);
  }

  async stat(path: string): Promise<SandboxStats> {
    const stat = await this.client.fs.stat(path);
    return {
      isDirectory: () => stat.type === "directory",
      isFile: () => stat.type === "file",
      size: stat.size,
      mtimeMs: stat.mtime,
    };
  }

  async access(path: string): Promise<void> {
    await this.client.fs.stat(path);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.client.fs.mkdir(path, options?.recursive ?? false);
  }

  async readdir(
    path: string,
    _options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    const entries = await this.client.fs.readdir(path);
    return entries.map((entry) => toDirent(path, entry));
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    if (options?.signal?.aborted) {
      throw getAbortError();
    }

    const executionId = randomUUID();
    const outputDirectory = `/tmp/launchstack-exec-${executionId}`;
    const stdoutPath = `${outputDirectory}/stdout`;
    const stderrPath = `${outputDirectory}/stderr`;
    const exitPath = `${outputDirectory}/exit`;
    await this.client.fs.mkdir(outputDirectory, true);
    let gitAuth: PreparedGitAuth | undefined;
    let running: Command | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    let outputSubscription: { dispose(): void } | undefined;
    const exitPollController = new AbortController();
    let executionResult: ExecResult | undefined;
    let executionError: unknown;
    let credentialsRemain = false;
    try {
      gitAuth = await this.prepareGitAuth();
      const authCleanup = gitAuth
        ? `trap 'rm -rf -- "$LAUNCHSTACK_GIT_AUTH_DIR"' EXIT\n`
        : "";
      const completionMarker = `__LAUNCHSTACK_EXEC_COMPLETE_${executionId}__`;
      const wrappedCommand = `${authCleanup}set +e
cd -- ${shellEscape(cwd)}
(${command}) >${shellEscape(stdoutPath)} 2>${shellEscape(stderrPath)}
printf '%s' "$?" >${shellEscape(exitPath)}
printf '%s\\n' ${shellEscape(completionMarker)}
exit 0`;
      running = await this.client.commands.runBackground(wrappedCommand, {
        env: this.getCommandEnv(gitAuth?.env),
        name: `launchstack-${executionId}`,
      });
      const timedOut = new Promise<"timeout">((resolve) => {
        timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      const aborted = new Promise<"aborted">((resolve) => {
        if (!options?.signal) return;
        if (options.signal.aborted) {
          resolve("aborted");
          return;
        }
        abortHandler = () => resolve("aborted");
        options.signal.addEventListener("abort", abortHandler, { once: true });
      });
      const completed = running
        .waitUntilComplete()
        .then(() => "completed" as const)
        .catch((error: unknown) => ({ error }) as const);
      const markerCompletion = Promise.withResolvers<"completed">();
      let commandOutput = "";
      const trackCommandOutput = (output: string) => {
        commandOutput = `${commandOutput}${output}`.slice(
          -completionMarker.length * 2,
        );
        if (commandOutput.includes(completionMarker)) {
          markerCompletion.resolve("completed");
        }
      };
      outputSubscription = running.onOutput(trackCommandOutput);
      void running
        .open()
        .then(trackCommandOutput)
        .catch(() => {});
      const completedByExitMarker = (async (): Promise<"completed"> => {
        while (!exitPollController.signal.aborted) {
          const entries = await this.client.fs
            .readdir(outputDirectory)
            .catch(() => []);
          if (entries.some((entry) => entry.name === "exit")) {
            const hasExitMarker = await this.client.fs
              .readTextFile(exitPath)
              .then(() => true)
              .catch(() => false);
            if (hasExitMarker) return "completed";
          }
          await waitForPollingInterval(COMMAND_EXIT_POLL_MS);
        }
        return new Promise<"completed">(() => {});
      })();
      const outcome = await Promise.race([
        completed,
        markerCompletion.promise,
        completedByExitMarker,
        timedOut,
        aborted,
      ]);
      if (outcome === "timeout" || outcome === "aborted") {
        await killCommandWithGrace(running);
      } else if (
        typeof outcome === "object" &&
        !(outcome.error instanceof CommandError)
      ) {
        throw outcome.error;
      }

      const [stdout, stderr, exitCodeText] = await Promise.all([
        settleWithGrace(this.client.fs.readTextFile(stdoutPath), ""),
        settleWithGrace(this.client.fs.readTextFile(stderrPath), ""),
        settleWithGrace(this.client.fs.readTextFile(exitPath), ""),
      ]);
      const stdoutResult = truncateOutput(stdout);
      const stderrResult = truncateOutput(stderr);

      if (outcome === "aborted") {
        throw getAbortError();
      }
      if (outcome === "timeout") {
        executionResult = {
          success: false,
          exitCode: null,
          stdout: stdoutResult.output,
          stderr:
            stderrResult.output || `Command timed out after ${timeoutMs}ms`,
          truncated: stdoutResult.truncated || stderrResult.truncated,
        };
      } else {
        const parsedExitCode = Number.parseInt(exitCodeText.trim(), 10);
        const exitCode = Number.isFinite(parsedExitCode)
          ? parsedExitCode
          : null;
        executionResult = {
          success: exitCode === 0,
          exitCode,
          stdout: stdoutResult.output,
          stderr: stderrResult.output,
          truncated: stdoutResult.truncated || stderrResult.truncated,
        };
      }
    } catch (error) {
      executionError = error;
    } finally {
      exitPollController.abort();
      outputSubscription?.dispose();
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (abortHandler && options?.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }
      await settleWithGrace(
        this.client.fs.remove(outputDirectory, true),
        undefined,
      );
      if (gitAuth) {
        const removed = await settleWithGrace(
          this.client.fs
            .remove(gitAuth.directory, true)
            .then(() => true)
            .catch(() => false),
          false,
        );
        const absent = await settleWithGrace(
          this.client.fs
            .stat(gitAuth.directory)
            .then(() => false)
            .catch(() => true),
          false,
        );
        credentialsRemain = !removed || !absent;
      }
    }

    if (credentialsRemain) {
      throw new Error(
        "Scoped GitHub credential cleanup could not be verified",
        {
          cause: executionError,
        },
      );
    }
    if (executionError) throw executionError;
    if (!executionResult) {
      throw new Error("CodeSandbox command completed without a result");
    }
    return executionResult;
  }

  async execDetached(
    command: string,
    cwd: string,
  ): Promise<{ commandId: string }> {
    if (this.authContext.getStore()) {
      throw new Error("Detached commands cannot use scoped GitHub credentials");
    }
    const commandId = randomUUID();
    await this.client.commands.runBackground(command, {
      cwd,
      env: this.getCommandEnv(),
      name: `launchstack-detached-${commandId}`,
    });
    return { commandId };
  }

  async withGitHubAuth<T>(
    token: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.authContext.run(token, operation);
  }

  domain(port: number): string {
    return this.client.hosts.getUrl(port);
  }

  async extendTimeout(additionalMs: number): Promise<{ expiresAt: number }> {
    if (this.stopped) {
      throw new Error("Cannot extend timeout on stopped sandbox");
    }
    this.expiresAtValue += additionalMs;
    if (this.hooks?.onTimeoutExtended) {
      await this.hooks.onTimeoutExtended(this, additionalMs);
    }
    return { expiresAt: this.expiresAtValue };
  }

  async snapshot(): Promise<SnapshotResult> {
    await this.stop();
    return {
      snapshot: {
        provider: "codesandbox",
        id: this.instance.id,
        kind: "hibernate",
      },
    };
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopPromise ??= (async () => {
      if (this.hooks?.beforeStop) {
        try {
          await this.hooks.beforeStop(this);
        } catch (error) {
          console.error(
            "[CodeSandbox] beforeStop hook failed:",
            error instanceof Error ? error.message : error,
          );
        }
      }
      await this.disconnectClient();
      await this.sdk.sandboxes.hibernate(this.instance.id);
      this.stopped = true;
    })();

    try {
      await this.stopPromise;
    } finally {
      if (!this.stopped) this.stopPromise = undefined;
    }
  }

  get status(): SandboxStatus {
    return this.stopped ? "stopped" : "ready";
  }

  getState(): CodeSandboxState {
    return {
      type: "codesandbox",
      providerSandboxId: this.instance.id,
      sandboxId: this.instance.id,
      restore: { kind: "hibernate", sandboxId: this.instance.id },
      ...(this.currentBranch ? { currentBranch: this.currentBranch } : {}),
      ...(this.expiresAt ? { expiresAt: this.expiresAt } : {}),
      ...(this.commandPathValue
        ? { runtime: { commandPath: this.commandPathValue } }
        : {}),
    };
  }
}
