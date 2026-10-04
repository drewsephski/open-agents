# Agent Stacks

Initial Stack milestone baseline: `origin/main` at `64d981aa` (2026-10-04). The local checkout
matched the fetched remote before implementation.

## Architectural assessment

The product already has most of the execution machinery. Sessions own repository,
branch, sandbox lifecycle, installed global skills, Mission, Vercel project, and
delivery overrides. Chats pin an execution backend and main model. Native Workflow
steps reconstruct models and control-plane action tools; subagent models and
model-variant options previously came from current user preferences. These are
configuration seams, not reasons to replace the agent or sandbox packages.

Current constraints shape the first milestone:

- Vercel is the only selectable sandbox. CodeSandbox compatibility remains in
  lifecycle code but is not a supported Stack choice.
- Codex uses the connected subscription's models. It consumes Mission guidance,
  workspace skills, and worker instructions, but its workflow has no Composio
  tools or automatic delivery stage. OpenCode remains unavailable.
- Native automatic commit/push and PR creation happen after a completed turn.
  Mission guidance requests checks and Mission Evidence reports observations;
  verification is not a hard prerequisite for delivery today.
- Global skills are install references; repository skills are discovered from
  the workspace. Freezing references does not pin remote skill content.
- Composio connections are user-owned. The server Action Registry supports Gmail
  reads/approved writes and Linear reads with Chat-scoped execution sessions.
  Reads are automatic, mutations require server-bound approval, and writes
  use an at-most-once persisted dispatch claim with transport retries disabled.

## First milestone

**Build a Stack → give it work → LaunchStack runs it.**

Settings → Stacks creates a reusable worker configuration. Publishing an edit
adds a version; it never rewrites the previous version. Session creation starts
with Stack selection, then repository, branch, and desired outcome. Existing
Mission and delivery controls are explicit launch overrides.

`agent_stacks` contains owner, name, description, and current version number.
`agent_stack_versions` stores append-only configuration. Runtime, sandbox,
Mission, instructions, and delivery flags are scalar columns. Resolved model
selections, skills, and action capabilities use typed, Zod-validated structured
columns. Model IDs and provider options travel together; mutable variant IDs are
resolved before saving. A variant selection ID is retained only as UI/selection
provenance; execution and inference admission use the frozen resolved model.

Sessions store `stack_version_id` and a typed `stack_snapshot`. The latter contains
the name/version and effective configuration after launch overrides. Session and
initial Chat are inserted in the existing transaction. Database triggers reject
changes to versions or a Session's Stack reference/snapshot. Version publication
uses optimistic concurrency with `expectedVersion`; stale edits return 409.

The built-in **LaunchStack default** is resolved from current preferences and the
existing connected-runtime selection at launch, then frozen just like a custom
Stack. It has no per-user definition row. Its version 1 identifies the default
configuration format; the Session snapshot is the complete execution record.
Legacy Sessions retain their previous behavior without a speculative backfill.

New Chats inherit the Session snapshot's runtime/model. Existing explicit Chat
model changes and same-backend forks remain supported. Workflow model resolution
uses the frozen model options when using the Stack's model; an explicitly changed
Chat model is a run override. A different Stack version requires a new Session.
The snapshot is configuration provenance, not a promise to freeze platform code,
credential state, billing entitlement, repository contents, or third-party APIs.

## Action authority

A Stack can select Gmail reads or reads plus approved draft/send actions, and
Linear search/issue reads. Omitted toolkits grant no tools. The fixed policy is
`read: automatic`, `write: approval`, `destructive: denied`. Strict capability
schemas reject unknown toolkits, duplicate entries and policy weakening.

Every durable reconstruction loads the owned Chat's Session snapshot, resolves
its subset of the server Action Registry, and independently forces mutation
approval. No capabilities means no connection lookup. User-owned connection
contexts are separate from runtime sessions scoped by Chat, exact tools and
connected-account IDs. Broader or other-Chat sessions are never reused. See
[Action Providers](action-providers.md) for migration, SDK configuration and
reconstruction details. Subagents and Codex do not receive external tools.
Credentials never enter the Stack or coding sandbox.
This policy covers control-plane tools; it is not a network-egress restriction
on coding sandboxes or a general prohibition on shell-side effects.

## API

- `GET /api/stacks`: owned latest versions and the effective default configuration.
- `POST /api/stacks`: create version 1 from `{name, description, configuration}`.
- `POST /api/stacks/:id/versions`: publish with the same input and `expectedVersion`.
- `POST /api/sessions`: optionally select an owned `stackVersionId`; omission
  uses the default. An unavailable/unowned ID fails rather than falling back.

Stack writes require authentication, same-origin requests, input validation, and
rate limiting. Creation stores no secrets and does not connect accounts or spend
inference. Launch still checks the relevant inference source and uses existing
sandbox admission/provisioning. Connected-account and billing state remain live
authorization gates even when configuration is frozen.

## Next changes

1. **Verification and delivery:** add explicit Stack check requirements and a
   persisted verification result that gates auto delivery. Reuse Mission Evidence
   and existing commit/PR helpers; establish runtime capability support before
   offering Codex automatic delivery or external tools.
2. **Connections:** expose capability-aware connection readiness,
   required account selection, and richer approval summaries. Keep destructive
   operations denied until individually supported and tested.
3. **Triggered execution:** extract the current authenticated launch orchestration
   into a shared server service. Add event receipts, deduplication, work provenance,
   pinned Stack versions, and trigger-specific authorization. Start with one
   bounded GitHub issue or CI trigger; do not run directly from webhook payloads.

## Homepage recommendation

Replace “Describe the product. Get the stack.” with **“Build your agent stack.”**
Show actual supported configurations with a composition flow:
Runtime → Model → Skills → Apps → Sandbox → Guardrails → Delivery.
Use a real saved Stack as the example and link to the Stack editor. Label Codex's
capability limits and distinguish verification guidance from enforced checks.
Do this as a focused product/UI change after the Stack launch path is deployed;
the current homepage is unchanged in this milestone.

## Validation and rollout

Generated migration `0045_lean_spiral.sql` adds two tables, two nullable Session
columns, indexes/FKs, and immutability triggers. It does not backfill or provision
resources. Use the normal migration/deploy path; never `db:push`.

Tests apply the entire migration chain to local PGlite and exercise the real
Drizzle persistence functions, version concurrency, ownership, atomic launch,
and database immutability. Additional tests cover resolved snapshots, runtime
configuration consumption, launch overrides, unsupported capabilities, action
reconstruction, and existing approval/replay behavior. Provider OAuth, actual
delivery, cloud execution, and deployment still require environment-specific
proof.
