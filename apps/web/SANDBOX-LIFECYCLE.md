# Sandbox lifecycle

Sandbox lifecycle is server-authoritative and provider-neutral. The selected
provider is persisted when a new workspace is provisioned. Resume, commands,
pause, archive, and reconnect always use that exact provider.

See [provider fallback operations](../../docs/sandbox-provider-fallback.md) for
selection, circuit-breaker, security, rollout, and rollback details.

## Timing

| Constant | Default | Purpose |
|---|---:|---|
| DEFAULT_SANDBOX_TIMEOUT_MS | 5 hours standard / 40 minutes hobby | Proactive Vercel wrapper deadline |
| SANDBOX_INACTIVITY_TIMEOUT_MS | 30 minutes | Server inactivity window before provider pause |

Vercel also enforces its provider timeout. CodeSandbox receives the inactivity
window as its hibernation timeout. HTTP and WebSocket auto-wake are disabled so
stale preview/HMR connections cannot defeat server-authoritative hibernation.

## State machine

    provisioning -> active -> hibernating -> hibernated
                         ^                       |
                         |------ restoring -----|

Each session has at most one durable lifecycle workflow. It claims
sessions.lifecycleRunId, sleeps until the earlier of hibernateAfter or a known
provider expiry, then re-reads database state before acting. A non-null chat
activeStreamId prevents hibernation, and the evaluator checks again immediately
before stopping the provider.

Pause persists provider restore metadata before marking the session
hibernated:

- Vercel retains a named-sandbox or legacy native-snapshot restore key.
- CodeSandbox retains its hibernated sandbox ID.

Restore never invokes provider selection. A missing pinned provider resource is
terminal for that restore key and does not cause cross-provider fallback.

## Activity and safety nets

Activity is refreshed at chat start/finish, sandbox create/extend/restore, and
throttled textarea focus. Reconnect probes and status polling do not refresh
activity.

The status route is a lightweight database view. When it finds an overdue
active session it kicks the durable workflow. If workflow start is unavailable
in development, the kick path performs one inline evaluation. Stale workflow
leases can be replaced after the configured grace window.

## Compatibility

Legacy Vercel sandboxName, sandboxId, snapshotId, and snapshotUrl records remain
supported. API fields named hasSnapshot remain as compatibility aliases while
new responses also expose hasRestore and provider.

Provider-neutral checkpoints across providers are not implemented. There is no
durable encrypted object-storage abstraction suitable for secure user-work
transfer, and the lifecycle never silently commits or pushes work.

## Key files

| File | Purpose |
|---|---|
| lib/sandbox/provisioning.ts | New provision vs exact-provider restore |
| lib/sandbox/provider-circuit.ts | Database-backed provider circuit |
| lib/sandbox/lifecycle.ts | Provider-neutral lifecycle evaluator |
| app/workflows/sandbox-lifecycle.ts | Durable sleep/evaluate loop |
| app/api/sandbox/status/route.ts | DB-backed status |
| app/api/sandbox/reconnect/route.ts | Exact-provider liveness probe |
| app/api/sandbox/snapshot/route.ts | Compatibility pause/resume endpoint |
