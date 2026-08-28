import { describe, expect, test } from "bun:test";
import type { CodeSandbox } from "@codesandbox/sdk";
import { CodeSandboxSandbox } from "./sandbox";

class MemoryFs {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>(["/workspace", "/tmp"]);
  hangCredentialCleanup = false;
  hangExecReads = false;
  hangExecRemoves = false;

  async mkdir(path: string, _recursive: boolean) {
    this.directories.add(path);
  }

  async writeTextFile(path: string, content: string) {
    this.files.set(path, Buffer.from(content));
  }

  async writeFile(path: string, content: Uint8Array) {
    this.files.set(path, Buffer.from(content));
  }

  async readTextFile(path: string) {
    if (this.hangExecReads && path.startsWith("/tmp/launchstack-exec-")) {
      return new Promise<string>(() => {});
    }
    const value = this.files.get(path);
    if (!value) throw new Error("not found");
    return Buffer.from(value).toString("utf8");
  }

  async readFile(path: string) {
    const value = this.files.get(path);
    if (!value) throw new Error("not found");
    return value;
  }

  async stat(path: string) {
    if (
      this.hangCredentialCleanup &&
      path.startsWith("/tmp/launchstack-git-auth-")
    ) {
      return new Promise<never>(() => {});
    }
    const file = this.files.get(path);
    if (file) return { type: "file" as const, size: file.length, mtime: 1 };
    if (this.directories.has(path)) {
      return { type: "directory" as const, size: 0, mtime: 1 };
    }
    throw new Error("not found");
  }

  async remove(path: string, _recursive: boolean) {
    if (
      (this.hangExecRemoves && path.startsWith("/tmp/launchstack-exec-")) ||
      (this.hangCredentialCleanup &&
        path.startsWith("/tmp/launchstack-git-auth-"))
    ) {
      return new Promise<void>(() => {});
    }
    for (const file of this.files.keys()) {
      if (file === path || file.startsWith(`${path}/`)) this.files.delete(file);
    }
    for (const directory of this.directories) {
      if (directory === path || directory.startsWith(`${path}/`)) {
        this.directories.delete(directory);
      }
    }
  }

  async readdir(path: string) {
    const prefix = `${path}/`;
    return [...this.files.keys()]
      .filter((filePath) => filePath.startsWith(prefix))
      .map((filePath) => filePath.slice(prefix.length).split("/")[0])
      .filter((name, index, names) => name && names.indexOf(name) === index)
      .map((name) => ({
        name,
        type: "file" as const,
        isSymlink: false,
      }));
  }
}

function createSdkFake(
  options: {
    failCommand?: boolean;
    failCommandStart?: boolean;
    failConnect?: boolean;
    failHibernationUpdate?: boolean;
    hangCommand?: boolean;
    hangKill?: boolean;
    hangWaitAfterExit?: boolean;
    omitCompletionOutput?: boolean;
    omitExitMarker?: boolean;
    packageJson?: string;
  } = {},
) {
  const fs = new MemoryFs();
  if (options.packageJson) {
    fs.files.set("/workspace/package.json", Buffer.from(options.packageJson));
  }
  const calls = {
    create: [] as unknown[],
    background: [] as Array<{ command: string; options: unknown }>,
    hibernate: [] as string[],
    shutdown: [] as string[],
    keepActive: [] as boolean[],
    killed: 0,
    disconnected: 0,
    disposed: 0,
  };
  let backgroundCount = 0;
  const commands = {
    async run() {
      return {};
    },
    async runBackground(command: string, commandOptions: unknown) {
      calls.background.push({ command, options: commandOptions });
      backgroundCount += 1;
      if (options.failCommandStart && backgroundCount > 1) {
        throw new Error("provider command start failure");
      }
      const outputDirectory = command.match(
        /\/tmp\/launchstack-exec-[a-f0-9-]+/,
      )?.[0];
      if (outputDirectory) {
        const stdout = command.includes("__LAUNCHSTACK_NODE_BIN__")
          ? "__LAUNCHSTACK_NODE_BIN__=/nvm/node/v24/bin\n"
          : command.includes("PATH")
            ? "/root/.bun/bin:/usr/local/bin:/usr/bin:/bin"
            : "stdout";
        await fs.writeTextFile(`${outputDirectory}/stdout`, stdout);
        await fs.writeTextFile(`${outputDirectory}/stderr`, "stderr");
      }
      const shouldFail = options.failCommand && backgroundCount > 1;
      const shouldHang = options.hangCommand && backgroundCount > 1;
      const omitCompletionOutput =
        options.omitCompletionOutput && backgroundCount > 1;
      const omitExitMarker = options.omitExitMarker && backgroundCount > 1;
      const completionMarker = command.match(
        /__LAUNCHSTACK_EXEC_COMPLETE_[a-f0-9-]+__/,
      )?.[0];
      const outputListeners = new Set<(output: string) => void>();
      let commandOutput = "";
      let status = "RUNNING";
      return {
        get status() {
          return status;
        },
        async waitUntilComplete() {
          if (shouldFail) throw new Error("provider command failure");
          if (shouldHang) return new Promise(() => {});
          if (outputDirectory && !omitExitMarker) {
            await fs.writeTextFile(`${outputDirectory}/exit`, "0");
          }
          if (completionMarker && !omitCompletionOutput) {
            commandOutput = completionMarker;
            for (const listener of outputListeners) listener(commandOutput);
          }
          status = "FINISHED";
          if (options.hangWaitAfterExit && backgroundCount > 1) {
            return new Promise(() => {});
          }
        },
        async kill() {
          calls.killed += 1;
          if (options.hangKill) return new Promise(() => {});
          status = "KILLED";
        },
        onOutput(listener: (output: string) => void) {
          outputListeners.add(listener);
          return { dispose: () => outputListeners.delete(listener) };
        },
        async open() {
          return commandOutput;
        },
      };
    },
  };
  const client = {
    workspacePath: "/workspace",
    fs,
    commands,
    hosts: { getUrl: (port: number) => `https://${port}-csb.test` },
    keepActiveWhileConnected(value: boolean) {
      calls.keepActive.push(value);
    },
    async disconnect() {
      calls.disconnected += 1;
    },
    dispose() {
      calls.disposed += 1;
    },
  };
  const instance = {
    id: "csb-1",
    bootupType: "RESUME",
    connect: async () => {
      if (options.failConnect) throw new Error("provider connect failure");
      return client;
    },
    updateHibernationTimeout: async () => {
      if (options.failHibernationUpdate) {
        throw new Error("hibernation update failure");
      }
    },
  };
  const sdk = {
    sandboxes: {
      async create(input: unknown) {
        calls.create.push(input);
        return instance;
      },
      async resume() {
        return instance;
      },
      async hibernate(id: string) {
        calls.hibernate.push(id);
      },
      async shutdown(id: string) {
        calls.shutdown.push(id);
      },
    },
  } as unknown as CodeSandbox;
  return { sdk, fs, calls };
}

const createOptions = {
  credentials: { apiKey: "test-key" },
  hibernationTimeoutMs: 60_000,
  ports: [3000],
};

describe("CodeSandbox adapter", () => {
  test("creates with auto-wake disabled and exposes provider-neutral state", async () => {
    const fake = createSdkFake();
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );

    expect(fake.calls.create[0]).toMatchObject({
      privacy: "public-hosts",
      automaticWakeupConfig: { http: false, websocket: false },
      hibernationTimeoutSeconds: 60,
    });
    expect(fake.calls.keepActive).toEqual([false]);
    expect(sandbox.domain(3000)).toBe("https://3000-csb.test");
    expect(sandbox.getState()).toMatchObject({
      type: "codesandbox",
      providerSandboxId: "csb-1",
      restore: { kind: "hibernate", sandboxId: "csb-1" },
    });
  });

  test("supports text and binary filesystem operations", async () => {
    const fake = createSdkFake();
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );

    await sandbox.writeFile("/workspace/a.txt", "hello", "utf-8");
    await sandbox.writeFileBuffer("/workspace/a.bin", Buffer.from([0, 1, 2]));
    expect(await sandbox.readFile("/workspace/a.txt", "utf-8")).toBe("hello");
    expect(await sandbox.readFileBuffer("/workspace/a.bin")).toEqual(
      Buffer.from([0, 1, 2]),
    );
    expect((await sandbox.stat("/workspace/a.txt")).isFile()).toBe(true);
    await expect(sandbox.access("/workspace/a.txt")).resolves.toBeUndefined();
  });

  test("clones through scoped auth without persisting the token", async () => {
    const fake = createSdkFake();
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      {
        ...createOptions,
        source: { repo: "https://github.com/acme/private.git" },
        githubToken: "setup-secret",
      },
      fake.sdk,
    );

    expect(
      fake.calls.background.some((call) =>
        call.command.includes("'git' 'clone'"),
      ),
    ).toBe(true);
    expect(JSON.stringify(fake.calls.background)).not.toContain("setup-secret");
    expect(
      [...fake.fs.files.keys()].some((path) =>
        path.includes("launchstack-git-auth"),
      ),
    ).toBe(false);
    await sandbox.stop();
  });

  test("shell-quotes command environment values for SDK 2.4", async () => {
    const fake = createSdkFake();
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      { ...createOptions, env: { AUTHOR_NAME: "First Last" } },
      fake.sdk,
    );
    await sandbox.exec("env", sandbox.workingDirectory, 1_000);

    const commandOptions = fake.calls.background.at(-1)?.options as {
      env?: Record<string, string>;
    };
    expect(commandOptions.env?.AUTHOR_NAME).toBe("'First Last'");
  });

  test("honors exact repository runtime pins and persists the command path", async () => {
    const fake = createSdkFake({
      packageJson: JSON.stringify({
        engines: { node: "24.x" },
        packageManager: "pnpm@11.5.1+sha512.abc",
      }),
    });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );

    expect(
      fake.calls.background.some((call) =>
        call.command.includes("nvm install 24"),
      ),
    ).toBe(true);
    expect(
      fake.calls.background.some((call) =>
        call.command.includes("pnpm@11.5.1"),
      ),
    ).toBe(true);
    expect(sandbox.getState().runtime?.commandPath).toBe(
      "/nvm/node/v24/bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin",
    );

    await sandbox.exec("node --version", sandbox.workingDirectory, 1_000);
    const commandOptions = fake.calls.background.at(-1)?.options as {
      env?: Record<string, string>;
    };
    expect(commandOptions.env?.PATH).toBe(
      "'/nvm/node/v24/bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin'",
    );
  });

  test("scopes GitHub auth to one command and guarantees cleanup", async () => {
    const fake = createSdkFake();
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );
    await sandbox.withGitHubAuth("secret-token", () =>
      sandbox.exec("git fetch", sandbox.workingDirectory, 1_000),
    );

    const credentialFiles = [...fake.fs.files.keys()].filter((path) =>
      path.includes("launchstack-git-auth"),
    );
    expect(credentialFiles).toEqual([]);
    const fetchCall = fake.calls.background.at(-1);
    expect(JSON.stringify(fetchCall)).not.toContain("secret-token");
    expect(fetchCall?.command).toContain("LAUNCHSTACK_GIT_AUTH_DIR");
  });

  test("cleans GitHub credentials when a provider command throws", async () => {
    const fake = createSdkFake({ failCommand: true });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );
    await expect(
      sandbox.withGitHubAuth("secret-token", () =>
        sandbox.exec("git fetch", sandbox.workingDirectory, 1_000),
      ),
    ).rejects.toThrow("provider command failure");
    expect(
      [...fake.fs.files.keys()].some((path) =>
        path.includes("launchstack-git-auth"),
      ),
    ).toBe(false);
  });

  test("cleans GitHub credentials when a provider command cannot start", async () => {
    const fake = createSdkFake({ failCommandStart: true });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );
    await expect(
      sandbox.withGitHubAuth("secret-token", () =>
        sandbox.exec("git fetch", sandbox.workingDirectory, 1_000),
      ),
    ).rejects.toThrow("provider command start failure");
    expect(
      [...fake.fs.files.keys()].some((path) =>
        path.includes("launchstack-git-auth"),
      ),
    ).toBe(false);
  });

  test("kills timed-out commands and hibernates cleanly", async () => {
    const fake = createSdkFake({ hangCommand: true });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );
    const result = await sandbox.exec(
      "long-running",
      sandbox.workingDirectory,
      1,
    );
    expect(result).toMatchObject({ success: false, exitCode: null });
    expect(fake.calls.killed).toBe(1);

    await sandbox.stop();
    expect(fake.calls.disconnected).toBe(1);
    expect(fake.calls.disposed).toBe(1);
    expect(fake.calls.hibernate).toEqual(["csb-1"]);
  });

  test("uses the exit marker when the provider completion promise hangs", async () => {
    const fake = createSdkFake({
      hangWaitAfterExit: true,
      omitCompletionOutput: true,
    });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );

    const result = await sandbox.exec(
      "pnpm install",
      sandbox.workingDirectory,
      5_000,
    );

    expect(result).toMatchObject({ success: true, exitCode: 0 });
    expect(fake.calls.killed).toBe(0);
    await sandbox.stop();
  });

  test("uses the command marker when completion and filesystem events hang", async () => {
    const fake = createSdkFake({
      hangWaitAfterExit: true,
      omitExitMarker: true,
    });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );

    const result = await sandbox.exec(
      "pnpm install",
      sandbox.workingDirectory,
      5_000,
    );

    expect(result).toMatchObject({ success: false, exitCode: null });
    expect(fake.calls.killed).toBe(0);
    await sandbox.stop();
  });

  test("returns after the kill grace period when a timed-out provider kill hangs", async () => {
    const fake = createSdkFake({ hangCommand: true, hangKill: true });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );

    const startedAt = Date.now();
    const result = await sandbox.exec(
      "sleep forever",
      sandbox.workingDirectory,
      1,
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(fake.calls.killed).toBe(1);
    await sandbox.stop();
  });

  test("bounds provider filesystem calls after a command timeout", async () => {
    const fake = createSdkFake({ hangCommand: true });
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );
    fake.fs.hangExecReads = true;
    fake.fs.hangExecRemoves = true;

    const startedAt = Date.now();
    const result = await sandbox.exec(
      "sleep forever",
      sandbox.workingDirectory,
      1,
    );

    expect(result).toMatchObject({ success: false, exitCode: null });
    expect(Date.now() - startedAt).toBeLessThan(3_000);
    await sandbox.stop();
  });

  test("fails closed when scoped credential cleanup cannot be verified", async () => {
    const fake = createSdkFake();
    const sandbox = await CodeSandboxSandbox.createWithSdk(
      createOptions,
      fake.sdk,
    );
    fake.fs.hangCredentialCleanup = true;

    await expect(
      sandbox.withGitHubAuth("secret-token", () =>
        sandbox.exec("git fetch", sandbox.workingDirectory, 1_000),
      ),
    ).rejects.toThrow("credential cleanup could not be verified");
    await sandbox.stop();
  });

  test("shuts down a new sandbox when the SDK client cannot connect", async () => {
    const fake = createSdkFake({ failConnect: true });

    await expect(
      CodeSandboxSandbox.createWithSdk(createOptions, fake.sdk),
    ).rejects.toThrow("provider connect failure");
    expect(fake.calls.shutdown).toEqual(["csb-1"]);
  });

  test("re-hibernates a restored sandbox when initialization fails", async () => {
    const fake = createSdkFake({ failHibernationUpdate: true });

    await expect(
      CodeSandboxSandbox.connectWithSdk(
        "csb-1",
        {
          type: "codesandbox",
          providerSandboxId: "csb-1",
          restore: { kind: "hibernate", sandboxId: "csb-1" },
        },
        createOptions,
        fake.sdk,
      ),
    ).rejects.toThrow("hibernation update failure");
    expect(fake.calls.disconnected).toBe(1);
    expect(fake.calls.disposed).toBe(1);
    expect(fake.calls.hibernate).toEqual(["csb-1"]);
  });
});
