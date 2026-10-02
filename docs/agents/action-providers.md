# Authenticated external actions

External actions execute in the Launchstack web control plane. `packages/agent`
accepts an additional AI SDK `ToolSet` through `createOpenAgent`; it does not know
about Composio, OAuth credentials, or the sandbox execution backend.

`apps/web/lib/actions/provider.ts` defines the small Action Provider boundary:
create a user session, initiate a connection, check connection status, and build
tools. Composio is the initial implementation. It uses `@composio/core` and
`@composio/vercel`, with a direct-tools session limited to Gmail:

- `GMAIL_FETCH_EMAILS`
- `GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID`
- `GMAIL_CREATE_EMAIL_DRAFT`
- `GMAIL_SEND_EMAIL`

Composio discovery, generic execution, workbench, Instant, and other toolkit
actions are unavailable. A second local allowlist rejects unexpected schemas.
The Composio project key is server-only; Gmail credentials remain with Composio.
Neither credentials nor the provider client are included in sandbox state or
environment variables.

## Sessions and durable steps

`action_provider_sessions` stores one provider session ID per Launchstack user.
First connection uses a PostgreSQL advisory transaction lock to serialize
concurrent creation. Chatting does not create sessions or initiate OAuth.

`/api/connections/gmail` derives user identity from Better Auth. POST initiates
OAuth and supplies a fixed return path to `/settings/connections`; GET reads
Composio's authoritative connection state. Callback query parameters never
establish connection status. Browser responses contain status or an OAuth
redirect URL, never provider session IDs or credentials.

Message conversion and each agent step reconstruct tools server-side from the
authenticated user ID and database session ID. Tools, client objects, and
closures never cross a Vercel Workflow step boundary. Each agent instance merges
its action tools with the existing coding tools and rejects name collisions.
Delegated coding subagents do not receive Gmail tools.

## Approval and retry behavior

Creating a Gmail draft and sending an email always set AI SDK `needsApproval:
true`. Fetches do not. The existing chat pause/resume and Approve/Deny controls
handle these actions. The Gmail renderer shows the entire email input before
approval. The chat API checks mutation parts against the server-persisted
assistant message, including tool call ID, payload, approval ID, and decision.

`action_executions` records approved mutations before remote dispatch. A replay
of a completed call returns its stored output; a concurrent or uncertain call
does not dispatch again. Session execution uses a Composio client with transport
retries disabled. A timeout, crash, or failure to persist a successful response
leaves the call claimed: check Gmail before asking for a new action. This is
at-most-once dispatch, not a guarantee of exactly-once remote delivery.

Sending uses `GMAIL_SEND_EMAIL` with the complete reviewed payload rather than
an externally editable draft ID. It does not remove a previously saved draft.
Saving a Gmail draft is optional; a reply can first be drafted as chat text,
then sent after the separate send approval.

## Setup and proof

1. Set `COMPOSIO_API_KEY` in the web application's server environment. Optionally
   set `COMPOSIO_GMAIL_AUTH_CONFIG_ID` to a custom Gmail auth config. Never pass
   these variables to a coding sandbox.
2. Apply generated migration `0042_rainy_korath.sql` through the existing migration
   script/deployment flow. Preserve preceding migrations.
3. Sign in to Launchstack, open Settings → Connections, and connect Gmail.
4. In a chat, ask to read a specific email and draft a reply. Review and approve
   creation if saving the draft to Gmail.
5. Ask to send the reply. Review recipients, subject, body, cc, and bcc in the
   send tool card; Approve sends, Deny does not.
6. Check the sent message in Gmail. Repeating the same approved tool call must
   reuse its recorded result instead of sending again.

The SDK integration tests use the real Composio and AI SDK implementations with
stubbed HTTP, including reconstruction between approval request and response.
Other tests cover per-user persistence, concurrent session creation, approval
tampering, rendering, API authentication/origin checks, and mutation replay.
They do not replace live OAuth, Gmail delivery, or deployed Workflow proof.
