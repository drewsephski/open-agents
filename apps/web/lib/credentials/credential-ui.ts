import type { SafeCredentialState } from "@/lib/access/access-ui";

export function getCredentialActionCopy(state: SafeCredentialState): {
  action: "Add API key" | "Replace API key";
  inputLabel: "OpenRouter API key";
} {
  return {
    action: state === "valid" ? "Replace API key" : "Add API key",
    inputLabel: "OpenRouter API key",
  };
}

const SAFE_CREDENTIAL_ERRORS: Record<string, string> = {
  credential_rejected:
    "OpenRouter rejected this API key. Check the key and try again.",
  credential_validation_unavailable:
    "OpenRouter validation is temporarily unavailable. Try again shortly.",
  invalid_payload: "Enter a valid OpenRouter API key.",
  credential_delete_failed: "Could not remove the API key. Try again.",
};

export function getCredentialErrorMessage(code: string | undefined): string {
  return (
    (code ? SAFE_CREDENTIAL_ERRORS[code] : undefined) ??
    "Could not update the API key. Try again."
  );
}
