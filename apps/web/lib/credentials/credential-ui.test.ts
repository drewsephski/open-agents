import { describe, expect, test } from "bun:test";
import {
  getCredentialActionCopy,
  getCredentialErrorMessage,
} from "./credential-ui";

describe("credential UI state", () => {
  test("uses add and replace language without ever rendering plaintext", () => {
    expect(getCredentialActionCopy("missing")).toEqual({
      action: "Add API key",
      inputLabel: "OpenRouter API key",
    });
    expect(getCredentialActionCopy("valid").action).toBe("Replace API key");
  });

  test("maps server codes to inline sanitized errors", () => {
    expect(getCredentialErrorMessage("credential_rejected")).toBe(
      "OpenRouter rejected this API key. Check the key and try again.",
    );
    expect(getCredentialErrorMessage("unexpected-secret-provider-body")).toBe(
      "Could not update the API key. Try again.",
    );
  });
});
