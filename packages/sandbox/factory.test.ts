import { describe, expect, test } from "bun:test";
import {
  connectSandbox,
  provisionSandbox,
  type ConnectOptions,
  type SandboxState,
} from "./factory";
import { SandboxProviderError, type SandboxProvider } from "./errors";
import type { Sandbox, ExecResult } from "./interface";
import type {
  SandboxProviderAdapter,
  SandboxProviderCircuitState,
} from "./provider";

function createSandbox(provider: SandboxProvider): Sandbox {
  return {
    type: "cloud",
    provider,
    workingDirectory: "/workspace",
    readFile: async () => "",
    readFileBuffer: async () => Buffer.alloc(0),
    writeFile: async () => {},
    stat: async () => ({
      isDirectory: () => false,
      isFile: () => true,
      size: 0,
      mtimeMs: 0,
    }),
    access: async () => {},
    mkdir: async () => {},
    readdir: async () => [],
    exec: async (): Promise<ExecResult> => ({
      success: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      truncated: false,
    }),
    stop: async () => {},
    getState: () =>
      provider === "vercel"
        ? {
            type: "vercel",
            providerSandboxId: "session-1",
            restore: { kind: "named", sandboxName: "session-1" },
          }
        : {
            type: "codesandbox",
            providerSandboxId: "csb-1",
            restore: { kind: "hibernate", sandboxId: "csb-1" },
          },
  };
}

function providerError(
  provider: SandboxProvider,
  errorClass: SandboxProviderError["errorClass"],
  options: { retryable?: boolean; fallbackSafe?: boolean } = {},
) {
  return new SandboxProviderError(errorClass, {
    provider,
    errorClass,
    operation: "provision",
    retryable: options.retryable ?? false,
    fallbackSafe: options.fallbackSafe ?? false,
  });
}

function adapter(
  provider: SandboxProvider,
  connect: (state: SandboxState) => Promise<Sandbox>,
): SandboxProviderAdapter {
  return {
    provider,
    isEnabled: () => true,
    connect,
    classifyError: (error, operation) =>
      error instanceof SandboxProviderError
        ? error
        : new SandboxProviderError(String(error), {
            provider,
            errorClass: "unknown",
            operation,
            retryable: false,
            fallbackSafe: false,
          }),
  } as SandboxProviderAdapter;
}

function options(
  vercel: SandboxProviderAdapter,
  codesandbox: SandboxProviderAdapter,
  extra: Partial<ConnectOptions> = {},
): ConnectOptions {
  return {
    providerOrder: ["vercel", "codesandbox"],
    providerAdapters: { vercel, codesandbox },
    ...extra,
  } as ConnectOptions;
}

describe("provider selection", () => {
  test("selects Vercel when the primary provisions successfully", async () => {
    const attempts: SandboxProvider[] = [];
    const result = await provisionSandbox(
      { persistenceKey: "session-1" },
      options(
        adapter("vercel", async () => {
          attempts.push("vercel");
          return createSandbox("vercel");
        }),
        adapter("codesandbox", async () => {
          attempts.push("codesandbox");
          return createSandbox("codesandbox");
        }),
      ),
    );

    expect(result.provider).toBe("vercel");
    expect(result.reason).toBe("primary");
    expect(attempts).toEqual(["vercel"]);
  });

  test("returns an allocated sandbox when circuit success bookkeeping fails", async () => {
    const selected = createSandbox("vercel");
    let fallbackAttempts = 0;
    const events: Array<{ name: string; [key: string]: unknown }> = [];

    const result = await provisionSandbox(
      {},
      options(
        adapter("vercel", async () => selected),
        adapter("codesandbox", async () => {
          fallbackAttempts += 1;
          return createSandbox("codesandbox");
        }),
        {
          circuitBreaker: {
            async getState() {
              return { isOpen: false, failureCount: 0 };
            },
            async recordSuccess() {
              throw new Error("circuit database unavailable");
            },
            async recordFailure() {
              return { isOpen: false, failureCount: 0 };
            },
          },
          telemetry: (event) => events.push(event),
        },
      ),
    );

    expect(result.sandbox).toBe(selected);
    expect(result.provider).toBe("vercel");
    expect(fallbackAttempts).toBe(0);
    expect(events).toContainEqual({
      name: "sandbox.provider.circuit.bookkeeping",
      provider: "vercel",
      operation: "record_success",
      success: false,
    });
  });

  test("falls back on an explicitly classified exhausted quota", async () => {
    const attempts: SandboxProvider[] = [];
    const result = await provisionSandbox(
      {},
      options(
        adapter("vercel", async () => {
          attempts.push("vercel");
          throw providerError("vercel", "quota_exhausted", {
            fallbackSafe: true,
          });
        }),
        adapter("codesandbox", async () => {
          attempts.push("codesandbox");
          return createSandbox("codesandbox");
        }),
      ),
    );

    expect(result.provider).toBe("codesandbox");
    expect(result.reason).toBe("fallback");
    expect(attempts).toEqual(["vercel", "codesandbox"]);
  });

  test("never falls back on authentication or unknown errors", async () => {
    for (const errorClass of ["authentication", "unknown"] as const) {
      let fallbackAttempts = 0;
      const promise = provisionSandbox(
        {},
        options(
          adapter("vercel", async () => {
            throw providerError("vercel", errorClass);
          }),
          adapter("codesandbox", async () => {
            fallbackAttempts += 1;
            return createSandbox("codesandbox");
          }),
        ),
      );
      await expect(promise).rejects.toMatchObject({ errorClass });
      expect(fallbackAttempts).toBe(0);
    }
  });

  test("falls back after repeated transient failures open the durable circuit", async () => {
    const circuit = {
      failures: 0,
      async getState(): Promise<SandboxProviderCircuitState> {
        return { isOpen: false, failureCount: this.failures };
      },
      async recordSuccess() {},
      async recordFailure(): Promise<SandboxProviderCircuitState> {
        this.failures += 1;
        return { isOpen: this.failures >= 3, failureCount: this.failures };
      },
    };
    const createOptions = options(
      adapter("vercel", async () => {
        throw providerError("vercel", "transient_provisioning", {
          retryable: true,
        });
      }),
      adapter("codesandbox", async () => createSandbox("codesandbox")),
      { circuitBreaker: circuit },
    );

    await expect(provisionSandbox({}, createOptions)).rejects.toMatchObject({
      errorClass: "transient_provisioning",
    });
    await expect(provisionSandbox({}, createOptions)).rejects.toMatchObject({
      errorClass: "transient_provisioning",
    });
    expect((await provisionSandbox({}, createOptions)).provider).toBe(
      "codesandbox",
    );
  });

  test("skips an open primary circuit with a single explicit fallback event", async () => {
    let vercelAttempts = 0;
    const events: Array<{ name: string; [key: string]: unknown }> = [];
    const result = await provisionSandbox(
      {},
      options(
        adapter("vercel", async () => {
          vercelAttempts += 1;
          return createSandbox("vercel");
        }),
        adapter("codesandbox", async () => createSandbox("codesandbox")),
        {
          circuitBreaker: {
            async getState(provider) {
              return {
                isOpen: provider === "vercel",
                failureCount: provider === "vercel" ? 3 : 0,
              };
            },
            async recordSuccess() {},
            async recordFailure() {
              return { isOpen: false, failureCount: 0 };
            },
          },
          telemetry: (event) => events.push(event),
        },
      ),
    );

    expect(result).toMatchObject({
      provider: "codesandbox",
      reason: "circuit-open",
    });
    expect(vercelAttempts).toBe(0);
    expect(
      events.filter((event) => event.name === "sandbox.provider.fallback"),
    ).toEqual([
      {
        name: "sandbox.provider.fallback",
        from: "vercel",
        to: "codesandbox",
        errorClass: "circuit_open",
      },
    ]);
  });

  test("restores on the original provider and never consults another adapter", async () => {
    let vercelAttempts = 0;
    const codesandbox = createSandbox("codesandbox");
    const restored = await connectSandbox(
      {
        type: "codesandbox",
        providerSandboxId: "csb-1",
        restore: { kind: "hibernate", sandboxId: "csb-1" },
      },
      options(
        adapter("vercel", async () => {
          vercelAttempts += 1;
          return createSandbox("vercel");
        }),
        adapter("codesandbox", async () => codesandbox),
      ),
    );

    expect(restored).toBe(codesandbox);
    expect(vercelAttempts).toBe(0);
  });

  test("does not retry a mutating command in another provider", async () => {
    let codesandboxAttempts = 0;
    const vercel = createSandbox("vercel");
    vercel.exec = async () => ({
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: "application failure",
      truncated: false,
    });
    const result = await provisionSandbox(
      {},
      options(
        adapter("vercel", async () => vercel),
        adapter("codesandbox", async () => {
          codesandboxAttempts += 1;
          return createSandbox("codesandbox");
        }),
      ),
    );

    expect(
      await result.sandbox.exec("mutate", "/workspace", 1_000),
    ).toMatchObject({ success: false });
    expect(codesandboxAttempts).toBe(0);
  });

  test("accepts backward-compatible Vercel state", async () => {
    let received: SandboxState | undefined;
    await connectSandbox(
      { type: "vercel", sandboxName: "legacy-session" },
      options(
        adapter("vercel", async (state) => {
          received = state;
          return createSandbox("vercel");
        }),
        adapter("codesandbox", async () => createSandbox("codesandbox")),
      ),
    );
    expect(received).toEqual({
      type: "vercel",
      sandboxName: "legacy-session",
    });
  });
});
