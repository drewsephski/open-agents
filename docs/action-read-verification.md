# External Action read verification

Live OAuth/provider execution is separate from mocked automated validation.
The development environment on 2026-10-04 has no `COMPOSIO_API_KEY`, so Gmail and
Linear live reads are **NOT_CONFIGURED**, not proven. An opt-in probe is provided.

Use an existing LaunchStack User and accounts already authorized for that same
User. Get the exact IDs from Settings → Connections or the readiness response.
Do not substitute your Composio dashboard's unrelated account. The installed SDK
does not expose a verified email/workspace profile without raw credential data;
the UI uses safe word identifiers/account IDs as its fallback.

From the repository root, with Node 24 and server-only configuration available:

```sh
LAUNCHSTACK_ACTION_READ_PROBE=1 \
LAUNCHSTACK_PROBE_USER_ID='existing-launchstack-user-id' \
LAUNCHSTACK_PROBE_GMAIL_ACCOUNT_ID='existing-gmail-account-id' \
LAUNCHSTACK_PROBE_LINEAR_ACCOUNT_ID='existing-linear-account-id' \
pnpm --dir apps/web actions:probe:read
```

The script reads `apps/web/.env.local` if present. Do not put secrets in command
arguments, shell history, logs or committed files. Set server `COMPOSIO_API_KEY`
through the environment or that ignored file. Custom auth-config IDs remain
optional. No OAuth flow is initiated by the script.

Default queries are Gmail `newer_than:1d` and Linear `launchstack`; each list/search
is bounded to **one** result. Optional `LAUNCHSTACK_PROBE_GMAIL_QUERY` and
`LAUNCHSTACK_PROBE_LINEAR_QUERY` override the query (maximum 200 characters).
It requests reduced Gmail payloads where the exact schema supports them.

For full list-and-detail evidence, explicitly select one harmless, accessible
message/issue in the provider UI and set `LAUNCHSTACK_PROBE_GMAIL_DETAIL_ID` or
`LAUNCHSTACK_PROBE_LINEAR_DETAIL_ID`. Detail calls do not print bodies, titles,
descriptions, addresses or raw provider errors. The probe validates all inputs
against the loaded exact schemas. If a recognized bounded parameter is absent,
it refuses execution instead of making an unbounded request.

The only executable slugs are the four registered reads:
`GMAIL_FETCH_EMAILS`, `GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID`,
`LINEAR_SEARCH_ISSUES`, `LINEAR_GET_LINEAR_ISSUE`.
No generic discovery/execute tools, writes or mutation retry paths are used.
Every request revalidates the exact User/account binding. The provider creates
a read-only scoped runtime, disables transport retries for execution, and deletes
the transient runtime in `finally`. Account/OAuth relationships remain untouched.
Requests have strict timeouts; the entire CLI has a 150-second hard deadline.
A hard process termination can prevent cleanup; remove an orphan runtime in
Composio if needed. Normal CI never invokes live accounts.

Outputs:

- `PASS`: bounded list/search and one detail read succeeded; sanitized action
  names, success flags, structural field counts and an account-ID fingerprint.
- `PASS_LIST_ONLY`: bounded list/search succeeded; detail execution is unproven.
- `NOT_CONFIGURED`: opt-in, credentials, existing User ID or exact account ID missing.
- `PROVIDER_UNAVAILABLE`: authorization, schema, execution, timeout or cleanup could
  not be confirmed; private provider details are suppressed. Exit code is nonzero.

Retain the date, commit SHA, toolkit, account fingerprint and sanitized output
with verification evidence. Do not call an empty mocked list a live-provider PASS.
OAuth success alone also does not prove action execution.

SDK research: installed `@composio/core` 0.22.0 / `@composio/vercel` 0.12.1;
[connected account documentation](https://docs.composio.dev/docs/auth-configuration/connected-accounts),
[session pinning and lifecycle](https://docs.composio.dev/kb/guide/mcp-tool-router-sessions),
[bounded Gmail reads](https://docs.composio.dev/kb/guide/toolkits-gmail).
Installed source/declarations determine the APIs used here; current hosted docs
may describe newer APIs.
