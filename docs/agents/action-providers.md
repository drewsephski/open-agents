# Authenticated external actions

External actions execute in the LaunchStack web control plane. `packages/agent`
accepts an additional AI SDK `ToolSet` through `createOpenAgent`; credentials,
Composio clients, OAuth and action execution never enter the coding sandbox.
Subagents and Codex do not receive these tools.

```text
Frozen Stack snapshot
  ↓
Action capability (Gmail read / read_write; Linear read)
  ↓
LaunchStack Action Registry
  ↓
Scoped Composio runtime session
  ↓
User-owned connected account (pinned by ID)
  ↓
Exact provider tool
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
Legacy sessions without snapshots retain precisely the four Gmail tools when
connected; they do not inherit Linear. Malformed snapshots fail closed.

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
Connection status comes from Composio's `ACTIVE` account state, never callback
query parameters. Credentials remain with Composio; browser responses expose only
connection status or an HTTPS authorization URL, never account/session IDs.

`action_runtime_sessions` stores worker contexts keyed by
`(user, chat, provider, scope hash)`. The hash covers a canonical exact tool list
and exact connected-account IDs. A Chat with a narrower capability set or a
different connected account cannot reuse a broader session. Different Chats do
not share runtime sessions. Reconnection can select a new account and hence
creates a new context with the same frozen tool policy; it cannot widen the
Stack. There is no runtime session update/widening operation in LaunchStack.
The stored scope is validated and compared before reuse.

First creation holds a PostgreSQL advisory transaction lock through provider
creation and insert; a composite primary key provides an additional database
boundary. Concurrent requests for an identical scope reuse the winner. A crash
between remote creation and database commit can leave an unused remote session;
no actions are executed during creation and it is never reused implicitly.

Each durable message conversion/agent step reloads the owned Chat's Session
snapshot, resolves allowed tools through the registry, checks the required
connections, and ensures the same scoped runtime. Only serializable user/Chat
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

Audited baseline: fetched `origin/main` at `716491a0` (merged PR #10).
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
needed. Installed `toolkits`/`authorize` methods do not accept a separate request
options argument; session retrieval, creation, schema loading and execution do.

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
