# Authenticated external actions

External actions execute in the LaunchStack web control plane. `packages/agent`
accepts an additional AI SDK `ToolSet` through `createOpenAgent`; credentials,
Composio clients, OAuth and action execution never enter the coding sandbox.
Subagents and Codex do not receive these tools.

```text
Server Action Registry
  ↓
Frozen Stack capability
  ↓
Frozen Session account binding + live User authorization
  ↓
Scoped Composio execution session
  ↓
Exact provider tool schema
  ↓
Fixed approval policy
  ↓
Durable execution
```

## Registry and capabilities

`apps/web/lib/actions/registry.ts` owns the complete supported external surface:

| Toolkit | Exact tool | Behavior | Approval |
| --- | --- | --- | --- |
| Gmail | `GMAIL_FETCH_EMAILS` | Read | Automatic |
| Gmail | `GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID` | Read | Automatic |
| Gmail | `GMAIL_CREATE_EMAIL_DRAFT` | Write | Required |
| Gmail | `GMAIL_SEND_EMAIL` | Write | Required |
| Linear | `LINEAR_SEARCH_ISSUES` | Read | Automatic |
| Linear | `LINEAR_GET_LINEAR_ISSUE` | Read | Automatic |

Stack capabilities use a strict discriminated union. Unknown toolkit/action IDs,
extra fields, duplicate toolkit declarations, Linear writes and weakened policies
fail validation. The fixed policies remain `read: automatic`, `write: approval`,
`destructive: denied`. No destructive actions are registered. A Stack selects a
subset of the registry; neither prompts nor generic discovery can add authority.
Legacy sessions without snapshots retain only a proven persisted Gmail runtime scope,
never newly discovered accounts or Linear. Without proof they remain coding-only.
Legacy Stack workers that require Actions but have no proven scope must launch a
new Session. Malformed snapshots fail closed.

Composio is the authentication/execution provider, not the policy authority.
The provider creates sessions with exact toolkit/tool enable lists and preloads
only the selected tools (at most six schemas). A second registry/scope filter
rejects unexpected schemas and checks the slug again at dispatch. The native
runtime independently filters and enforces approval even if a provider returns
extra tools or the wrong approval metadata. No generic execute, discovery,
GraphQL, proxy, workbench, Instant or connection-management tools reach the model.

## Connections versus execution sessions

Connected accounts are reusable, user-owned authorization relationships managed
by Composio. They survive the creation of narrower runtime sessions; existing
Gmail users do not need new OAuth because of this migration.

`action_provider_sessions` now stores one **connection management context** per
`(user, provider, toolkit)`. New contexts have zero executable tools. Existing
Gmail contexts are preserved, including their remote configuration, but are used
only for authorization/status APIs. Workers never load or execute their tools.
Connection status comes from Composio's `ACTIVE`, enabled, User-filtered PRIVATE
account list, never callback query parameters or a connection session's implicit
active account. Credentials remain with Composio. Browser responses expose only
account IDs and safe word identifiers (falling back to account ID), connection
status, or an HTTPS authorization URL. Raw `data`, `params`, `state`, credentials
and execution-session IDs are never returned. A provider word identifier is not
a verified Gmail address or Linear workspace name.

`action_runtime_sessions` stores worker contexts keyed by
`(user, chat, provider, scope hash)`. The hash covers a canonical exact tool list
and exact connected-account IDs. A Chat with a narrower capability set or a
different connected account cannot reuse a broader session. Different Chats do
not share runtime sessions, but inherit the same Session launch bindings.
Reconnection cannot change existing bindings. A new Session can intentionally
select a different account. There is no runtime session update/widening operation in LaunchStack.
The stored scope is validated and compared before reuse.

First creation holds a PostgreSQL advisory transaction lock through provider
creation and insert; a composite primary key provides an additional database
boundary. Concurrent requests for an identical scope reuse the winner. A crash
between remote creation and database commit can leave an unused remote session;
no actions are executed during creation and it is never reused implicitly.

Each durable message conversion/agent step reloads the owned Chat's Session
snapshot and Session bindings, resolves allowed tools through the registry,
revalidates the exact accounts, and ensures the same scoped runtime. Only serializable user/Chat
IDs cross Workflow boundaries; clients, tool functions and OAuth state are rebuilt
inside steps. A missing connection or unconfigured deployment produces a clear
error before runtime creation/dispatch for a frozen Stack. No capabilities means
no provider/connection lookup. Legacy disconnected sessions retain their
coding-only fallback.

## Approval and retry behavior

Registered writes always set AI SDK `needsApproval: true`; reads set false.
The shared action renderer shows the full write payload, including recipients,
subject, body, cc and bcc for Gmail, before the existing Approve/Deny controls.
The chat API binds responses to the persisted assistant message in the same
owned Chat: message/call IDs, tool name, complete input, approval ID and prior
decision. Tool substitution (including a write renamed to a read), changed
arguments, forged approvals and replaced denials are rejected. Unknown dynamic
actions fail closed. Read calls need no approval.

`action_executions` still claims writes before dispatch using
`(user, chat, tool call ID)`. A completed replay returns its stored result only
when tool and input match. An in-flight/uncertain replay never dispatches again.
Composio session execution uses `maxRetries: 0`. A timeout, crash, provider error,
or failure to persist a successful result leaves the claim intact. The user
must check the connected app before requesting a new action. This is at-most-once
dispatch, not exactly-once remote delivery. Error messages never include private
provider details.

Sending uses the complete reviewed `GMAIL_SEND_EMAIL` payload rather than an
externally editable draft ID. Draft creation and send remain separate approvals;
sending does not delete a saved draft. No external write is autonomous.

## SDK/API evidence and rollout

Audited baseline: fetched `origin/main` at `ff8a609d` (merged PR #11 and #10).
Installed SDKs: `@composio/core` **0.22.0**, `@composio/vercel` **0.12.1**.
Their installed declarations and implementations were inspected alongside the
[current session configuration docs](https://docs.composio.dev/docs/configuring-sessions),
[connected-account docs](https://docs.composio.dev/docs/auth-configuration/connected-accounts)
and [Linear catalog](https://composio.dev/toolkits/linear).
The Linear slugs above were verified in the catalog's published tool data.

The installed SDK's `SessionPreset.DIRECT_TOOLS` disables search, multi-execute,
connection management and workbench by default. We also explicitly disable
connection management, sandbox and Instant, supply exact preloaded tools and
pin `connectedAccounts`. `getRawToolRouterSessionTools` loads session-filtered
schemas; `session.execute` dispatches a single exact slug. No SDK upgrade is
needed. The packaged declarations for `toolkits`/`authorize` do not expose request options
(even though packaged source files show broader signatures). The connection path
uses the typed raw session-link endpoint with a strict timeout and no retries.
Workers never use implicit toolkit connection discovery.

Set server-only `COMPOSIO_API_KEY`. Optional `COMPOSIO_GMAIL_AUTH_CONFIG_ID` and
`COMPOSIO_LINEAR_AUTH_CONFIG_ID` select custom auth configurations; otherwise
Composio-managed authentication is used. Never forward these to a sandbox.
Settings → Connections uses the same component/API handler for both toolkits.
`/api/connections/:toolkit` rejects unknown names, authenticates users, checks
same-origin POSTs and fixes the callback to `/settings/connections`. The existing
`/api/connections/gmail` URL remains compatible. Stack editing does not require
an existing connection.

Migration `0046_stormy_wild_child.sql` adds the runtime table and extends the
connection-context primary key, tagging all existing rows as Gmail. It does not
rewrite Stack versions, snapshots, action execution claims or remote accounts.
Apply the normal migration/deployment chain; never `db:push`.

Tests use real installed Composio/AI SDKs with stubbed HTTP to check exact session
configuration, unexpected-schema filtering, Linear reads, durable reconstruction,
approval pause/resume/denial and disabled dispatch retries. Database tests cover
concurrent creation, scope isolation and the entire migration chain with an old
Gmail row. Registry, Stack, API, renderer and at-most-once tests cover the remaining
policy boundaries. These tests do not prove live OAuth, Gmail delivery, Linear
reads with real credentials, or deployed Workflow execution.


## Launch readiness and account bindings

A **Stack capability** says what a worker may do. A **connected account** is a
User-owned authorization relationship held by Composio. An **account binding** is
the exact identity chosen for a Session execution context. An **execution session**
is the narrow runtime for User + Chat + exact tools + exact connected accounts.

`POST /api/stacks/readiness` resolves an owned immutable version (or the existing
server-resolved default), then composes existing model-credential, Codex,
repository-access and sandbox-capacity policies with required account checks.
It creates no execution session, sandbox or model call. Its result contains
`ready`, structured blockers/remediation, required capability levels, available
safe accounts and resolved bindings. Sandbox capacity remains advisory; atomic
sandbox admission and model-call admission still revalidate their own budgets.
Readiness does not guarantee provider health, quota or future OAuth validity.

`POST /api/sessions` repeats readiness independently before Session/Chat creation
or provisioning. Optional `actionAccountIds` selects one exact account per
required toolkit. Unknown IDs, unauthorized accounts, unrelated selections and
unknown toolkits fail closed. Required capabilities are never removed. A unique
eligible account may be selected automatically; multiple accounts require an
explicit choice. The launcher submits the IDs shown in its readiness result,
so an account change between inspection and launch blocks instead of substituting.
Blocked launches return HTTP 409 with `readiness.blockers`.

The nullable `sessions.action_bindings` column stores only IDs and safe labels,
separately from the immutable, portable Stack definition. New launches always
write an object (including `{}` for no Actions). There is no API for editing a
Session's bindings; a database trigger also rejects binding edits (including
legacy backfill guesses). All its Chats inherit them. Migration `0047_amazing_valkyrie`
adds this nullable column plus an immutability trigger; it preserves snapshots/runtime rows and does not
backfill historical identity. For a legacy Chat, exactly one persisted runtime
scope can prove its binding; ambiguous/missing scopes never guess current accounts.

**Account identity may be frozen for provenance while authorization remains live
and revocable.** Before loading tools and immediately before each dispatch,
LaunchStack lists active, enabled PRIVATE accounts for the same User/toolkit and
requires the frozen ID to remain in that list. A revoked, deleted, disabled or
replaced account blocks with its bound identity and reconnection guidance. Another
active account never substitutes. Composio's pinned-account enforcement provides
a second authorization boundary at remote execution. Authorization cannot be
made atomic across LaunchStack and a remote SaaS; a remote request already accepted
before revocation cannot be recalled.

The installed SDK supports multiple accounts, bounded cursor pagination and
exact toolkit overrides. This milestone selects one account per toolkit per
Session, lists all eligible accounts (bounded to ten pages), and does not introduce
preferences, aliases, shared-account authorization or an account-management system.
The existing OAuth/reconnect flow remains; if reconnect creates a new provider ID,
existing workers must be relaunched. No raw credential objects are used to infer
email addresses or workspace names. Verified friendly identities can be added
later via a deliberate provider-safe profile path.

## Runtime lifecycle

External tools are positively enabled only for `launchstack_native` Chats and
native Stack snapshots. Unknown/non-native backends receive zero external tools.
Archived Sessions and deleted Chats cannot dispatch through loaded tools.

Archive and deletion perform best-effort provider cleanup: at most 50 runtime
references per operation, in batches of five, with 30-second request timeouts.
Deleting a missing remote runtime is idempotent. Archive keeps local scope evidence
for provenance and legacy resume; Chat/Session deletion cascades local rows via
FKs. A confirmed remote 404 during schema loading can recreate the **same** scope
once, after revalidating exact accounts. Other failures do not recreate or broaden
runtimes. No action execution is retried through this recovery path.

Revocation is enforced live even while an unused provider runtime remains. No
webhook or garbage collector is added. Cleanup failures, more than 50 references,
a crash between remote creation and commit, or concurrent deletion/provisioning
can leave orphan remote records. Those records receive no new LaunchStack dispatch;
provider-side credential revocation still applies. Operators can remove them in
Composio. Changing Stack versions creates a new Session with new scope; existing
bindings/snapshots/approval claims remain untouched.

## Opt-in live reads

See [read smoke verification](../action-read-verification.md). Normal CI uses
isolated mocks/stubbed HTTP and never requires SaaS accounts. The probe uses the
same server registry, exact tool schemas, frozen IDs, live account checks and
scoped provider as the app. It lists at most one result and optionally fetches one
operator-selected harmless message/issue. It never sends, creates, modifies or
deletes provider data; only its transient execution session is deleted.
