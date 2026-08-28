# Task 2 Implementer Report: BYOK credential lifecycle

## Status

Complete. Task 2 adds the server-only OpenRouter BYOK credential lifecycle without onboarding/settings UI, Stripe, managed keys, access-policy integration, or credential propagation into workflows/sandboxes.

## Implementation

- Added AES-256-GCM envelope encryption with 96-bit random nonces, separate authentication tags, base64url envelope encoding, and explicit key versions.
- Bound ciphertext authentication to the credential purpose, owning User ID, provider, and key version through AES-GCM additional authenticated data. Wrong keys, unknown versions, ciphertext tampering, and cross-User envelope transplants fail closed with a stable non-secret error.
- Added a server-only keyring loader using `ENCRYPTION_KEY` plus `ENCRYPTION_KEY_VERSION`; retained rotation keys are loaded from `ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`, and so on. Added the active configuration to `apps/web/.env.example`.
- Added an owner-scoped Drizzle store. Every select, upsert, and delete includes both authenticated User ID and fixed `openrouter` provider predicates. Replacement is one `INSERT ... ON CONFLICT DO UPDATE` statement after validation/encryption, so rejected or failed replacement attempts do not overwrite an existing valid credential.
- Added OpenRouter validation through the official authenticated, non-inference `GET https://openrouter.ai/api/v1/key` endpoint. No completion request is made. 401/403 responses map to safe invalid/revoked states; other failures produce a stable availability error without reading or surfacing provider error bodies.
- Normalized provider labels to 80 characters and replaced any label containing the submitted plaintext key with `OpenRouter key` before persistence.
- Added authenticated `GET`, `PUT`, and `DELETE` handlers at `/api/settings/provider-credentials/openrouter`. Responses re-project exactly `state`, `label`, `lastFour`, and `validatedAt`; ciphertext, nonce, authentication tag, key version, and plaintext are never serialized.
- Ensured status and deletion do not load encryption material, keeping inspect/remove operations available during encryption configuration incidents.
- Updated the repository OpenRouter lesson with the untrusted-metadata rule learned during self-review.

No schema or migration changed: Task 1 already supplied the required `provider_credentials` envelope, metadata, validation, ownership, and uniqueness fields.

## TDD evidence

RED was captured before each implementation seam:

1. `pnpm test:verbose apps/web/lib/credentials/envelope-encryption.test.ts`
   - Failed: `Cannot find module './envelope-encryption'`.
2. `pnpm test:verbose apps/web/lib/credentials/openrouter-validation.test.ts`
   - Failed: `Cannot find module './openrouter-validation'`.
   - A later edge-case cycle failed three assertions for rejected/revoked states, safe unavailable errors, and label normalization before those behaviors were implemented.
3. `pnpm test:verbose apps/web/lib/credentials/provider-credentials.test.ts`
   - Failed: `Cannot find module './provider-credentials'`.
   - The first GREEN attempt exposed a missing `validationState` in the boundary fixture and was corrected before continuing.
4. `pnpm test:verbose apps/web/app/api/settings/provider-credentials/openrouter/route.test.ts`
   - Failed: `Cannot find module './route'`.
5. Self-review regression: a successful provider response echoing the plaintext key in `data.label` failed because the label would have been returned; the validator now replaces it with a generic label.

Final focused GREEN:

```text
pnpm test:verbose \
  apps/web/lib/credentials/envelope-encryption.test.ts \
  apps/web/lib/credentials/openrouter-validation.test.ts \
  apps/web/lib/credentials/provider-credentials.test.ts \
  apps/web/app/api/settings/provider-credentials/openrouter/route.test.ts

21 pass, 0 fail, 61 assertions across 4 files
```

Coverage includes encryption round trip; retained versions; wrong key/version; ciphertext tampering; cross-owner AAD failure; non-inference validation request shape; invalid/revoked/unavailable provider states; provider body and label redaction; ciphertext-only storage; atomic safe replacement; owner-scoped status/delete; write-only route responses; unauthenticated denial; malformed input; and thrown-error log/response sanitization.

## Verification

- Focused credential tests: PASS (`21 pass, 0 fail`).
- Web TypeScript: PASS (`pnpm --dir apps/web typecheck`).
- Diff whitespace: PASS (`git diff --check`).
- Required full gate: PASS (`pnpm run ci`).
  - Ultracite format/lint: PASS.
  - Monorepo typecheck: PASS, 4/4 tasks.
  - Isolated test suite: PASS, all 135 test files (one existing opt-in live smoke test skipped).
  - Migration/schema consistency: PASS.

The host ran Node `v26.3.0` while the repository declares Node `24.x`; pnpm emitted the existing engine warning, but every required gate passed.

## Self-review

Reviewed the complete uncommitted diff and traced request input -> authentication -> provider validation -> encryption -> owner-scoped persistence -> response projection.

Findings fixed before commit:

- Status/delete originally loaded the encryption key eagerly; production construction is now lazy so non-secret lifecycle operations remain available without key material.
- The initial tamper fixture could theoretically fail to alter a random final ciphertext character; it now deterministically changes the first encoded character.
- Authenticated provider metadata was initially trusted as safe display text; plaintext-key echoes are now detected and replaced before storage.

No remaining correctness, ownership, or secret-exposure findings were identified.

## Remaining external proof and deliberate exclusions

- No real OpenRouter credential was available, so provider validation is proven with the official endpoint contract and mocked boundary responses, not a live key canary. Official reference: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key
- `ENCRYPTION_KEY` must be configured with 32 random bytes encoded as base64 before create/replace can succeed. Status and delete remain functional without it.
- Runtime credential decryption/resolution and explicit propagation to authenticated model calls are intentionally deferred to Task 3. No plaintext is placed in workflow state or a sandbox in this task.
- Onboarding/Connections UI remains Task 6.
