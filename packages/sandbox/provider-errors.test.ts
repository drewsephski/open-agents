import { describe, expect, test } from "bun:test";
import { classifyCodeSandboxError } from "./codesandbox/errors";
import { classifyVercelSandboxError } from "./vercel/errors";

describe("provider error classifiers", () => {
  test("classifies explicit Vercel quota exhaustion as provisioning-safe", () => {
    expect(
      classifyVercelSandboxError(
        new Error("Insufficient credits for Sandbox"),
        "provision",
      ),
    ).toMatchObject({
      errorClass: "quota_exhausted",
      retryable: false,
      fallbackSafe: true,
    });
  });

  test("does not classify an unknown Vercel failure as quota", () => {
    expect(
      classifyVercelSandboxError(new Error("unexpected response"), "provision"),
    ).toMatchObject({
      errorClass: "unknown",
      fallbackSafe: false,
    });
  });

  test("classifies CodeSandbox concurrency rate limits narrowly", () => {
    expect(
      classifyCodeSandboxError(
        Object.assign(new Error("No concurrently running VMs remaining"), {
          type: "rate-limit",
        }),
        "provision",
      ),
    ).toMatchObject({
      errorClass: "account_limit",
      fallbackSafe: true,
    });
  });

  test("keeps generic CodeSandbox rate limits transient and initially unsafe", () => {
    expect(
      classifyCodeSandboxError(
        Object.assign(new Error("SDK requests exceeded"), {
          type: "rate-limit",
        }),
        "provision",
      ),
    ).toMatchObject({
      errorClass: "transient_provisioning",
      retryable: true,
      fallbackSafe: false,
    });
  });

  test("never treats unknown CodeSandbox failures as quota exhaustion", () => {
    expect(
      classifyCodeSandboxError(
        new Error("VM failed mysteriously"),
        "provision",
      ),
    ).toMatchObject({
      errorClass: "unknown",
      fallbackSafe: false,
    });
  });

  test("treats a lost CodeSandbox hibernation image as unavailable state", () => {
    expect(
      classifyCodeSandboxError(
        new Error(
          "CodeSandbox restore lost its hibernation snapshot; refusing a clean boot",
        ),
        "restore",
      ),
    ).toMatchObject({
      errorClass: "resource_not_found",
      retryable: false,
      fallbackSafe: false,
    });
  });
});
