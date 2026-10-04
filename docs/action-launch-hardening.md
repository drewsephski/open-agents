# Action launch hardening milestone

Baseline: fetched and fast-forwarded to `origin/main` **ff8a609d**, containing
merged PR #10 (immutable Stack versions/snapshots) and PR #11 (scoped registry,
Gmail writes with approvals, Linear reads). No toolkit or write capability added.

## Architectural assessment

PR #11 pinned IDs inside Chat runtime scopes, but resolved those IDs again from
each connection-management session's implicit active account during Workflow
reconstruction. Reconnect could therefore create a different scope for an existing
Chat. Missing connections were detected during reconstruction, after launch.
The runtime also excluded Codex with a denylist check instead of positively
requiring Native. Connection status exposed no account identity.

Composio core **0.22.0** and Vercel provider **0.12.1** support filtered, paginated
multiple-account lists, exact `connectedAccounts` pins and session deletion.
Packaged source and exported method signatures differ for authorization timeout
options; the typed raw session-link endpoint is used for bounded reconnects.
Turbo's missing Linear auth-config environment entry was also corrected.

## Binding and readiness design

Session-level `action_bindings` freezes IDs and safe display labels alongside the
Stack snapshot. It fits launch provenance, gives all Chats the same identity and
keeps reusable Stack definitions portable. An immutable database trigger rejects
changes, including guesses for legacy rows. Execution runtimes remain per Chat
and exact tool/account scope.

One account is bound per required toolkit. A unique eligible PRIVATE account can
be selected automatically; multiple accounts require an intentional launch
choice. Readiness reports the runtime/model, capability levels, available safe
accounts, bindings and structured blockers/remediation. It composes existing
model credential, Codex, repository-access and sandbox-capacity checks. Capacity
is advisory; existing atomic model/sandbox admission remains authoritative.

## APIs and UI

- `POST /api/stacks/readiness`: authenticated, owned-version/default resolution,
  explicit account selections and delivery overrides, no-store response.
- `POST /api/sessions`: independently recomputes readiness before persistence or
  provisioning; HTTP 409 includes blockers. The launcher submits displayed exact
  IDs, so stale readiness cannot substitute a newly active account.
- `GET /api/connections/:toolkit`: active safe accounts and status. Reconnect uses
  the existing same-origin POST with a fixed callback and HTTPS redirect.
- Launcher: required read/read-write capabilities, selected account, ambiguity
  selector, blocker links and disabled launch state.
- Connections: safe account labels/IDs and reconnect controls.
- Session header popover: Stack/version, runtime, launch model, repository and
  frozen connected apps. Existing Chat model overrides remain separate.

Provider word identifiers/account IDs are fallbacks, not verified email/workspace
profile claims. Raw credential-bearing fields are never copied into UI, Stacks,
bindings or sandboxes. Public shared-chat projections exclude launch bindings.

## Migration, authorization and lifecycle

Generated migration **0047_amazing_valkyrie** adds a nullable JSON column and an
explicit immutability trigger using the existing custom SQL migration convention.
No historical binding is backfilled; snapshots, connection rows and runtime scopes
are preserved. A legacy Chat may reuse exactly one persisted scope as evidence.
Missing/ambiguous evidence blocks required Actions; unconfigured legacy generic
workers retain coding-only behavior.

Exact frozen IDs are checked against live User/toolkit PRIVATE active accounts
before tool loading and every dispatch. Revocation/disable/replacement blocks;
another active account never substitutes. Composio's pins enforce the same identity
remotely. Revocation cannot recall a request already accepted by a remote SaaS.

Only Native Chats receive external tools. Archive blocks local dispatch and does
bounded best-effort remote cleanup. Deletion captures up to 50 references before
the FK cascade and cleans them afterward, in batches of five. Archive retains
scope evidence. A confirmed runtime 404 permits one recreation with the same scope;
execution errors never trigger retries. Cleanup crashes/races/overflow can leave
unused remote records; no garbage collector or revocation webhook is introduced.

## Verification on 2026-10-04

- **PASS:** Node 24 `pnpm run ci`: formatting/lint, all workspace TypeScript,
  **204 isolated test files, 1,264 passing tests, 3,261 assertions, zero failures**,
  migration consistency.
- **PASS:** full PGlite migration chain, upgrade from PR #11 with preserved
  snapshot/runtime evidence, null historical bindings, immutable new bindings,
  and allowed status/title changes.
- **PASS:** readiness, missing Gmail/Linear, Composio absent, account ambiguity,
  stale launch selection, Codex missing, sanitized metadata, revocation after tool
  loading, silent substitution refusal, deterministic reconstruction, positive
  backend policy, legacy proof handling, scope-preserving 404 recovery and bounded
  cleanup tests.
- **PASS:** existing Stack/Action tests, real SDKs with stubbed HTTP, Gmail approval
  payload/tool/approval-ID tampering checks, denial, at-most-once mutation replay,
  disabled transport retries and Linear read-only registry.
- **PASS:** canonical production `pnpm build` and **Vercel preview build**.
  Builds explicitly omitted live database migration; isolated upgrade tests provide
  migration evidence. Vercel pull supplied sensitive placeholders, so the build
  is compilation/function-output evidence, not production credential/auth proof.
- **Browser inspection:** real local readiness showed sandbox-capacity blockers.
  Existing local database lacks PR #10's Stack tables, so saved-Stack/provider UI
  states used labeled browser-only fixtures. Multiple Gmail selection removed its
  ambiguity blocker; missing Linear still disabled launch. The requirements panel
  scrolls. Fixtures were removed; no Session/provider data was created.
- **Gmail live: NOT_CONFIGURED. Linear live: NOT_CONFIGURED.** Neither local env
  files nor shell environment have Composio credentials. The opted-in probe exits
  with that status. Its safety/cleanup paths are mock-tested, not live-provider
  evidence. See [read verification](action-read-verification.md).

## Remaining proof and recommended next PR

Live OAuth/account identities, bounded Gmail/Linear list-and-detail reads,
provider-side cleanup/revocation under real credentials, deployed Workflow
reconstruction and deployment migrations remain unproven. No deployment, email,
issue/comment write or provider data mutation was performed.

Next PR: complete the credentialed read verification and add a deliberately
allowlisted, provider-safe profile path for verified Gmail addresses/Linear
workspace labels. Keep the same identity/authorization boundary before expanding
integrations or adding automation.
