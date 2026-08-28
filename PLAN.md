Summary: Plan a phased Launchstack monetization and provider-credential architecture: require a user-owned OpenRouter API key for the initial free/BYOK path, offer an optional Stripe subscription that uses a platform-owned OpenRouter key under explicit entitlements and limits, and preserve a provider/runtime boundary for future Codex and OpenCode connections.

Approved implementation scope: Implement Phases 1-3 end to end in the current project and add only the minimal `ExecutionBackend` seam required for future compatibility. Live Codex and OpenCode adapters remain a separate follow-up project.

Context:
- All current model transport is OpenRouter. `packages/agent/models.ts` creates OpenRouter language models, and `packages/agent/open-agent.ts` selects those models for both the main agent and subagents.
- The current runtime key comes only from `OPENROUTER_API_KEY`; the durable chat workflow resolves model choice but does not resolve a per-user credential or billing entitlement.
- Better Auth and PostgreSQL already provide authenticated user ownership. `apps/web/lib/db/schema.ts` has users, preferences, workflow usage, and token counts, but no provider credentials, Stripe customer/subscription state, or enforceable spend ledger.
- Onboarding currently has account and GitHub steps. Settings already has connections/models sections, making them the likely homes for BYOK setup and billing management.
- Existing unrelated edits in landing components and `globals.css` must be preserved.
- The hosted demo currently uses a deployment/domain-specific five-message limit in `apps/web/lib/managed-template-trial.ts`; that policy should be replaced or explicitly separated from the new BYOK/subscription access policy.
- OpenRouter supports programmatically created per-customer keys with credit limits and reset periods through its Management API. This is safer for the paid path than sharing one unrestricted platform key across every request because it provides per-user blast-radius and spend controls.
- Stripe recommends Billing + Checkout for recurring subscriptions, Customer Portal for self-service, signed webhook reconciliation for access, and locally persisted entitlements for fast authorization.
- The official Codex TypeScript SDK currently wraps and spawns the Codex CLI, streams structured JSONL events, and can accept an API key/base URL. OpenCode exposes both a password-protected headless server and a beta in-process SDK. Both belong beside the current agent runtime as execution adapters, not inside the OpenRouter model factory.

System Impact:
- Source of truth changes from one deployment-wide OpenRouter environment key to a server-side credential resolver keyed by authenticated user and current billing entitlement.
- Stripe webhook events, not Checkout redirects or client state, must become authoritative for subscription access.
- User-supplied provider secrets must be encrypted at rest, write-only after creation, redacted from logs/errors, and never sent to the browser or coding sandbox.
- Paid platform-funded inference needs a server-enforced allowance or abuse limit; a flat subscription without an enforceable cost policy creates unbounded model-spend exposure.
- Future Codex/OpenCode support should plug into a separate execution-provider/connection layer rather than being represented as OpenRouter model variants.

Product decisions:
- Users can finish onboarding without an OpenRouter key, but onboarding prominently requests it and the server blocks the first agent run until the user has either a valid BYOK key or an active Pro entitlement.
- Launch with one Pro Product at $29/month. Defer an annual Price until monthly retention and inference economics are observable. Do not add a free Stripe Product; BYOK is the free access path.
- Pro includes up to $10/month of platform-funded OpenRouter inference. At exhaustion, automatically fall back to the user's valid BYOK key; if none exists, block the next run with a clear allowance-exhausted action. No overages in v1.
- Managed inference uses a curated, server-configured model allowlist. BYOK users can access the broader compatible OpenRouter catalog. Very expensive or economically unpredictable models are BYOK-only. The allowlist is operational configuration, not hard-coded UI branching, so it can change without a schema migration.
- Codex/OpenCode will follow the T3 Code pattern: Launchstack orchestrates official agent runtimes through provider adapters. Authentication belongs to the provider CLI/runtime inside each user's isolated execution environment (for example `codex login` or `opencode auth`), not to a home-grown OAuth implementation in the Launchstack web process.

Approach:
1. Introduce a server-only `ModelCredentialResolver` for the existing Launchstack agent. Resolve either an encrypted user OpenRouter key (`byok`) or a limited per-customer OpenRouter key (`managed`) after checking a locally persisted Stripe entitlement. Pass the result through durable workflow call options; never inject either key into the sandbox.
2. Make BYOK the default/free access mode. Add a write-only OpenRouter credential step to onboarding and Connections, validate it server-side with a low-cost/auth-only OpenRouter endpoint, show only its label/last four and validation timestamp, and allow replacement/revocation.
3. Add one flat-rate paid Product with a monthly Price, Stripe-hosted Checkout, Customer Portal, and an idempotent signed webhook. Persist customer/subscription/entitlement state locally and gate managed inference from that state.
4. For each paid user, provision a distinct OpenRouter subkey using a Management API key and a monthly dollar limit matching the plan allowance. Keep the platform master/management credentials in server-side sensitive environment configuration. Revoke or disable the user subkey when paid entitlement ends.
5. Enforce access before starting a durable workflow and re-check at model-call boundaries where feasible. Track monetary cost as well as tokens; the existing `usage_events` table does not currently persist the normalized OpenRouter cost that is already available in `packages/agent/usage-metadata.ts`.
6. Replace the hosted-demo exception with an explicit access policy: eligible BYOK, active managed subscription, or a narrowly defined internal/admin bypass. Return structured remediation errors that drive “Add API key” or “Upgrade” UI.
7. Define an `ExecutionBackend` boundary in a later phase. Keep the existing native Launchstack agent as one backend. Following T3 Code's proven architecture, add a configured-instance registry plus adapters so orchestration addresses a thread rather than a specific agent implementation. Run Codex via `codex app-server` and JSON-RPC over stdio; run OpenCode through its supported SDK/headless HTTP server. Normalize messages, tool activity, approvals, user questions, session IDs, cancellation, and resume events into Launchstack's durable workflow contract.

Implementation sequence:

Phase 1 - BYOK access foundation
- Add encrypted, write-only OpenRouter credential storage using AES-256-GCM envelope data (`ciphertext`, `iv`, `authTag`, `keyVersion`) and a server-only `ENCRYPTION_KEY`. Do not reuse Better Auth's opaque OAuth-token encryption as an application credential API.
- Add authenticated create/replace/validate/delete/status endpoints. Validate against OpenRouter without spending meaningful inference credits, store only redacted metadata alongside ciphertext, and never return plaintext after insertion.
- Add the onboarding prompt, Connections management surface, and first-run access gate.
- Thread an explicit resolved OpenRouter config through `runAgentWorkflow` -> agent call options -> main/subagent model factories. Remove implicit environment-key lookup from authenticated user calls; retain a narrowly scoped deployment/internal fallback only where explicitly required by non-user background features.

Phase 2 - Stripe Pro subscription
- Add Stripe's current Node SDK and instantiate one server-side Stripe client with a least-privilege restricted key. Use one Pro Product and one $29 monthly Price referenced by environment configuration.
- Add Stripe-hosted subscription Checkout and Customer Portal routes. Omit `payment_method_types`; include Stripe's required `integration_identifier` on Checkout creation.
- Add a dedicated signed webhook endpoint with an event-receipt table for idempotency. Reconcile Checkout customer linkage plus subscription created/updated/deleted and entitlement changes into local PostgreSQL state. Browser redirects never grant access.
- Map the Pro Product to a `managed_openrouter` entitlement. Resolve feature access from locally persisted entitlement state, with a Stripe API reconciliation path for repair/operations.
- Do not enable `automatic_tax` until the business has active registrations in Stripe Tax; track this as a launch gate.

Phase 3 - Managed inference allowance
- Provision one limited OpenRouter subkey per entitled user via an OpenRouter Management API key, with a $10 monthly limit/reset. Store only the returned key encrypted; persist its hash/label and lifecycle metadata for rotation/revocation.
- Add `credentialSource` and exact normalized dollar cost to usage records. Reserve/check managed allowance before a new run, update actual cost from provider metadata after every step, and let the OpenRouter subkey remain the hard upstream backstop against concurrent overspend.
- Route managed requests only to the curated allowlist. On exhausted allowance, choose a validated BYOK key if present; otherwise return a structured `managed_allowance_exhausted` error and preserve the user's unsent prompt for retry after adding a key.
- Show subscription status, current allowance, renewal/reset timing, BYOK fallback state, and a Customer Portal action in Settings.
- Meter Running Sandbox wall-clock time separately from inference. BYOK includes 2 hours per UTC calendar month with one concurrent sandbox; Pro includes 25 hours per paid billing period with two concurrent sandboxes. Hibernate after 15 inactive minutes, preserve persistent state, and enforce allowance again before resume.
- Surface allowance warnings in-product: passive at 75%, prominent before new work at 90%, and an actionable fallback/block state at 100%. Do not add email allowance notifications in v1.

Phase 4 - Provider runtime architecture (separate project after monetization)
- Introduce `ExecutionBackend`, configured provider instances, and a normalized provider-event protocol without rewriting the existing Launchstack agent loop.
- Add Codex first: install/probe the official CLI in the sandbox, expose a terminal/device login flow to the user, run `codex app-server`, persist the provider thread ID, and translate JSON-RPC events/approvals into durable workflow events.
- Add OpenCode second: run its server bound to loopback with a random per-session password, use the official SDK client, expose provider auth methods through a controlled connection flow, persist its session ID, and normalize permission/question events.
- Pin/test supported CLI and protocol versions, expose health/update diagnostics, never copy host credentials into a sandbox, and erase ephemeral auth/runtime state when the owning sandbox is permanently archived.

Changes (likely file groups; exact files pending final clarification):
- `apps/web/lib/db/schema.ts` + generated migration - provider credentials, Stripe customer/subscription state, processed webhook events, entitlements, and cost fields/ledger.
- `apps/web/lib/credentials/*` - envelope encryption, redaction, OpenRouter validation, replace/revoke operations, and credential resolution.
- `packages/agent/open-agent.ts` and call option types - accept an explicit server-resolved OpenRouter config for main and subagent calls.
- `apps/web/app/workflows/chat.ts` and `apps/web/app/api/chat/route.ts` - authorize access and resolve a credential before model execution.
- `apps/web/app/api/settings/provider-credentials/*` and `apps/web/app/settings/connections/*` - write-only BYOK management UI/API.
- `apps/web/app/api/billing/checkout`, `portal`, and `webhook` plus `apps/web/lib/billing/*` - Stripe Checkout, Customer Portal, webhook reconciliation, entitlement resolution, and managed OpenRouter subkey lifecycle.
- `apps/web/app/settings/billing/*`, settings navigation, onboarding, and pricing UI - plan choice, billing status, allowance visibility, and remediation CTAs.
- `apps/web/components/landing/*` - public BYOK ($0) and Pro ($29/month) pricing section with explicit inference/sandbox allowances and no unlimited or unshipped-connector claims.
- `.env.example` and release documentation - encryption key, restricted Stripe API key, webhook secret, Price IDs, and OpenRouter Management API key.
- Future phase: `packages/agent-runtime/*` or equivalent - execution backend interface plus Codex/OpenCode adapters and normalized event protocol.

Verification:
- Credential unit tests: authenticated ownership, encryption round trip, wrong-key/key-version failure, write-only responses, redaction in errors/logs, replacement, revocation, and invalid/revoked OpenRouter keys.
- Access-policy tests: no key/no entitlement blocks first run; BYOK works; active Pro selects managed key; exhausted Pro selects BYOK; exhausted Pro without BYOK returns the structured remediation error; managed-only model restrictions cannot be bypassed by client input.
- Billing tests: Checkout parameters and ownership, Portal ownership, raw-body webhook signature verification, duplicate/out-of-order event idempotency, customer linkage, active/past-due/canceled transitions, and entitlement revocation.
- Allowance tests: exact cost persistence, concurrent run admission near the limit, reset boundary, OpenRouter subkey provisioning failure, key rotation, and subscription cancellation cleanup.
- Browser QA: onboarding can be completed without a key; first-run block preserves the prompt; Connections supports add/replace/remove; pricing Checkout return; Billing status and Portal; mobile and keyboard/accessibility paths.
- Provider-runtime phase: protocol contract fixtures, process crash/restart, login expiry, approval and question round trips, interrupt/resume, CLI version mismatch, sandbox archive cleanup, and provider isolation between users.
- Required repository gates after every implementation slice: generate and commit Drizzle migrations, run focused Bun tests, then `pnpm run ci`. Keep local code, migration application, Stripe test configuration/webhook delivery, OpenRouter provisioning, preview deployment, and real paid renewal proof as distinct release gates.
