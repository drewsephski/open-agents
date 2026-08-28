import { z } from "zod";

export const inferenceSourceSchema = z.enum([
  "byok",
  "managed",
  "administrative",
]);

export type InferenceSource = z.infer<typeof inferenceSourceSchema>;

export const credentialStateSchema = z.enum([
  "missing",
  "pending",
  "valid",
  "invalid",
  "revoked",
]);

export type CredentialState = z.infer<typeof credentialStateSchema>;

export const managedKeyStateSchema = z.enum([
  "missing",
  "provisioning",
  "active",
  "failed",
  "revoking",
  "revoked",
]);

export type ManagedKeyState = z.infer<typeof managedKeyStateSchema>;
