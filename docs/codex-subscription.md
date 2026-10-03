# Codex subscription access

Launchstack is free when a User supplies their own Codex Provider Connection or OpenRouter key. Pro is optional for Launchstack-managed AI usage. Existing free cloud Sandbox Allowances still apply: two running hours per UTC month, one concurrent sandbox.

In Connections, import `~/.codex/auth.json` created by `codex login` with ChatGPT. Keychain users can use `codex -c cli_auth_credentials_store="file" login` to create the file. API-key auth files are rejected so this connection cannot silently incur Platform API charges. Importing a login is explicit authorization to store and use it in the User's isolated cloud workspace. The connection is encrypted with the existing versioned AES-GCM keyring, bound to the User and Codex provider. HTTP responses contain connection status only; there is no token read endpoint.

New sessions and chats choose Codex while it is connected. Existing chats retain their pinned Execution Backend; start a new chat to use Codex. Codex selects its default subscription-supported model. Each turn receives the text/snippet conversation and current workspace rather than reusing a provider-private session. File attachments and native action/tool approvals are not translated. Gmail actions and automatic commit/PR flows remain Launchstack Native capabilities. Review and commit workspace changes explicitly.

The official CLI is pinned to 0.160.0, installed with pnpm in the isolated VM. Workflow steps dispatch it once per run and poll completion. A per-User database lease serializes Codex runs, including across chats and sandboxes, to avoid racing token refresh. Codex uses `danger-full-access` only inside the isolated cloud VM; nested bubblewrap is unsupported by the Vercel VM capabilities. The cloud VM is the execution boundary. Temporary auth lives on verified `/dev/shm` tmpfs outside the repository with restricted permissions, so disk checkpoints exclude it, is removed on completion/cancellation, and is killed by a watchdog when workflow polling stops. Refreshed auth is encrypted and saved with compare-and-set so it cannot undo a disconnect or overwrite a newer login. Provider diagnostic output and auth never enter workflow inputs or step results. Workspace diffs persist even when a run fails.

No billing entitlement or managed OpenRouter key is granted by a Codex connection. Creem account verification is a separate external gate; do not set `CREEM_LIVE_PAYMENTS_ENABLED=true` until live payments are enabled.

For an explicitly authorized local connection, run `pnpm --dir apps/web codex:connect-local <account-user-id>`. This discovers `$CODEX_HOME/auth.json` or `~/.codex/auth.json`, validates ChatGPT auth, and encrypts it for that existing account. It preserves an existing connection and refuses production mode. Local discovery is an operator command, never an HTTP endpoint that exposes the server operator's login to app users. Hosted browsers cannot automatically read a user's local credentials; use the file picker there.

Verify with `pnpm run ci` and an authenticated browser. Real OpenAI login and a VM task are required for provider proof; structural auth-file acceptance and mocked execution do not prove subscription validity.

References: [Codex authentication](https://learn.chatgpt.com/docs/auth), [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).
