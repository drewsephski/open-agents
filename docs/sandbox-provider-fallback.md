# Sandbox provider fallback operations

Launchstack provisions new sandboxes through an ordered provider registry.
Vercel Sandbox remains primary; CodeSandbox SDK is the first automatic
fallback. Existing sessions are pinned to the provider persisted in
sessions.sandbox_state for their entire lifecycle.

## Selection and safety boundary

The default effective order is vercel,codesandbox. CodeSandbox is skipped
unless CSB_API_KEY is present and it is not explicitly disabled.

Fallback is evaluated only while provisioning a new, unpinned workspace.
Provider reconnect, restore, command execution, git operations, pause, and
archive always target the persisted provider. Launchstack never replays a
mutating command in another provider.

Only exhausted credits/quota, account or concurrency limits, and provider
capacity can fall back immediately. Repeated transient provisioning failures
can open the provider circuit; an open circuit can move new provisioning to
the next provider. Authentication/configuration failures, policy rejection,
invalid source/setup, application failures, resource-not-found failures, and
unknown failures never fall back. Unknown errors are never guessed to be
quota exhaustion.

## Environment

    SANDBOX_PROVIDER_ORDER=vercel,codesandbox
    VERCEL_SANDBOX_ENABLED=true
    CSB_API_KEY=...
    # Optional; false disables fallback instantly.
    CODESANDBOX_ENABLED=true
    CODESANDBOX_TEMPLATE_ID=
    SANDBOX_CIRCUIT_FAILURE_THRESHOLD=3
    SANDBOX_CIRCUIT_WINDOW_MS=300000
    SANDBOX_CIRCUIT_OPEN_MS=120000
    SANDBOX_CIRCUIT_PROBE_LEASE_MS=30000

Existing Vercel-only deployments need no new variables. Provider order rejects
unknown names and duplicates. To disable CodeSandbox fallback instantly, set
CODESANDBOX_ENABLED=false or SANDBOX_PROVIDER_ORDER=vercel, then redeploy.
Keep CSB_API_KEY available until existing CodeSandbox sessions have finished
or hibernated because pinned sessions still need it to reconnect safely.

## Durable circuit breaker

sandbox_provider_circuits is the cross-instance source of truth. It records
only provider, normalized failure class, counts, cooldown, and half-open probe
lease; it contains no credentials, source URLs, user data, or sandbox IDs.

- Quota, account-limit, and capacity failures open immediately.
- Retryable transient provisioning failures open after the configured count
  inside the configured window.
- After cooldown, one request claims the database probe lease.
- A successful provision resets the provider circuit.
- Unsafe and unknown errors do not increment it.

Process memory is not used as the durable circuit state.

## Lifecycle and persistence

sandbox_state is a provider-neutral discriminated JSON union. New state stores
type, providerSandboxId, and provider restore metadata. Legacy Vercel
sandboxName, sandboxId, and snapshotId rows normalize lazily.

CodeSandbox is created with HTTP and WebSocket automatic wake disabled, and
the SDK client is configured not to keep the VM active merely because its
control connection exists. Server-authoritative activity and the durable
lifecycle workflow decide when to resume and hibernate it.

Provider-specific differences:

- Vercel named sandboxes reconnect by name and retain legacy native-snapshot
  compatibility.
- CodeSandbox pause is hibernation; restore resumes the same sandbox ID.
- CodeSandbox command output is captured through per-command temporary stdout,
  stderr, and exit files because its completion API does not expose the same
  result shape as Vercel.
- A CodeSandbox resume reporting a clean boot is rejected instead of silently
  cloning over missing user state.
- Detached CodeSandbox commands use a Launchstack-generated tracking ID
  because the current SDK does not expose a stable provider command ID.

## Security

GitHub installation tokens are repository-scoped and revoked outside the
provider attempt. Inside CodeSandbox, a one-command GIT_ASKPASS directory is
created with restrictive permissions, removed by a shell trap, removed again
through the native filesystem API, and verified absent. Tokens are never put
in persisted state, command text, telemetry, or preview URLs. Detached
commands cannot receive scoped GitHub credentials.

CodeSandbox hosts use public-hosts to match the current preview contract.
Treat preview URLs as public application endpoints: never put credentials in
rendered pages or query strings.

## Telemetry and dashboards

Structured JSON event names are:

- sandbox.provider.attempt
- sandbox.provider.selected
- sandbox.provider.failure
- sandbox.provider.circuit
- sandbox.provider.fallback
- sandbox.provider.restore

Fields are normalized provider, selection reason, latency, failure class,
retryability/fallback safety, and circuit count/cooldown. Logs exclude raw
provider errors, tokens, repository URLs, and sandbox IDs.

Alert on quota_exhausted, sustained fallback rate, circuits open across
multiple cooldowns, restore failures by provider, and provisioning p95 by
selected provider.

CodeSandbox limits change over time. As verified on 2026-08-28, the Build plan
lists 40 monthly VM hours, 20 new SDK sandboxes/hour, 10 concurrent SDK VMs,
and 1,000 SDK requests/hour. Confirm current limits on the
[official pricing page](https://codesandbox.io/pricing) before rollout.
Hibernation/resume and preview capabilities are described on the
[official SDK page](https://codesandbox.io/sdk) and
[official SDK release notes](https://codesandbox.io/blog/codesandbox-sdk).
The adapter pins @codesandbox/sdk 2.4.2; review the
[official repository](https://github.com/codesandbox/codesandbox-sdk) before
upgrading.

## Rollout

1. Apply migration 0039_outgoing_pete_wisdom.sql.
2. Deploy with Vercel-only effective configuration and confirm existing
   provisioning/lifecycle telemetry.
3. Add CSB_API_KEY, leave Vercel first, and run
   pnpm sandbox:probe:codesandbox.
4. Exercise a controlled fallback and preview provision.
5. Monitor selection, latency, quota, circuit, restore, and lifecycle signals.

The opt-in probe clones a repository, installs with pnpm, runs a Bun test,
starts a detached Next.js preview, reports the URL, verifies credential
cleanup, hibernates, and resumes. It exits with SKIP when CSB_API_KEY is absent
and is not part of normal CI.

## Rollback

1. Disable CodeSandbox for new provisioning.
2. Allow pinned CodeSandbox sessions to finish or hibernate; retain the key
   while they remain reconnectable.
3. Confirm no active/restoring CodeSandbox sessions remain.
4. Roll back code if needed. The additive circuit table can remain.

Old versions cannot interpret CodeSandbox state, so rolling back code before
draining pinned sessions makes those sessions temporarily inaccessible. Do not
delete or rewrite their JSON state.

## Explicit non-goals and extension seam

Cross-provider mid-session recovery is intentionally not implemented. The
repository has no suitable durable encrypted object-storage abstraction for a
secure provider-neutral checkpoint. Launchstack never silently commits or
pushes user work and never stores secrets in checkpoints.

Modal remains a tracked follow-up in this document. The package exports a
typed provider registration seam, but there is no Modal adapter or fake.
Shipping it requires a real state branch, adapter, classifier, contract suite,
credentials, lifecycle proof, and live compatibility probe.
