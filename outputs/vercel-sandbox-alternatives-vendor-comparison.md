# Vercel Sandbox Alternatives Vendor Comparison

Research date: August 28, 2026

Use case: Automatically fall back from Vercel Sandbox when its credits or capacity are unavailable while preserving Open Agents' command, filesystem, Git, preview, and hibernation workflows.

Budget: Free recurring allowance preferred; low-cost usage billing acceptable after free allowance.

Team size: Small product team / independent developer.

## Executive Recommendation

- Best overall fallback: **CodeSandbox SDK**. Its free Build plan includes 40 monthly VM-hours, up to 10 concurrent SDK VMs, private sandboxes, and VMs up to 4 vCPU / 8 GiB. Its API directly supports create, resume, filesystem access, shell execution, port previews, hibernation, and live forks. This is the closest match to the repository's current persistent Vercel lifecycle.
- Best secondary fallback: **Modal Sandbox**. It includes $30 of recurring monthly compute and has a mature TypeScript sandbox API, filesystem snapshots, reconnect-by-ID, tunnels, and up to 24-hour sessions. It is a good final safety net, but stopped sandboxes are terminal, so Open Agents would need to restore a new sandbox from a filesystem snapshot rather than resume the same environment.
- Best trial / migration candidate: **Daytona**. It has the closest feature breadth and strong persistent stop/start semantics, but the advertised $200 is trial compute rather than a clearly recurring free allowance. It should be evaluated as a possible future primary provider, not relied on as a forever-free fallback.
- Highest-risk option for this requirement: **E2B Hobby**. It is easy to integrate and includes $100 in one-time credits, but Hobby sessions are limited to one hour. It is useful for short stateless jobs, not the best match for Open Agents' longer, resumable workspace lifecycle.

## Comparison Table

Scoring weights: repository fit 40%, recurring free value 25%, API/integration fit 20%, and operational maturity/risk 15%.

| Vendor | Free allowance | Core fit | Integration fit | Main risk | Score |
| --- | --- | --- | --- | --- | --- |
| CodeSandbox SDK | 40 VM-hours/month; 10 concurrent SDK VMs | Native hibernate/resume, shell, filesystem, ports, forks | Very close to current `Sandbox` interface and lifecycle | Free capacity is finite; Together AI ownership adds roadmap concentration risk | 9.0/10 |
| Modal Sandbox | $30 compute credit/month | Exec, files, tunnels, snapshots, reconnect while running | Strong TypeScript SDK; snapshot restore needs an adapter workflow | No same-instance resume after termination; snapshots default to 30-day retention | 8.0/10 |
| Daytona | $200 trial compute; first 5 GiB storage free | Persistent stop/start, snapshots, files, async commands, previews | Closest overall feature set; official TypeScript SDK | Trial is not a perpetual free tier; lower tiers restrict arbitrary egress | 7.8/10 |
| E2B | $100 one-time credits; no card required | Commands, files, exposed ports, connect, timeout extension, pause/resume | Small adapter and familiar agent-sandbox API | One-hour Hobby lifetime; credits are one-time; pause lifecycle has evolved | 7.0/10 |

## Repository Fit

The repository already has a useful provider abstraction in `packages/sandbox/interface.ts`, but the persisted discriminator and factory in `packages/sandbox/factory.ts` accept only `type: "vercel"`. The current lifecycle also assumes durable names, reconnect, timeout extension, exposed ports, snapshots, and hibernate/restore.

The portable core is:

- synchronous command execution with separate stdout/stderr and exit status;
- detached/background commands for preview servers;
- text and binary filesystem operations plus stat/readdir;
- a stable provider sandbox ID persisted in the session;
- public or authenticated preview URLs for declared ports;
- stop/hibernate and later restore;
- temporary GitHub credential injection and prompt removal;
- abort, timeout, and quota-error classification.

Provider-specific concepts currently leak into the shared contract: `SnapshotResult` explicitly describes a native Vercel snapshot ID, `SandboxState` only supports Vercel, and `setGitHubAuthToken` assumes Vercel's network-policy header injection. These should be generalized before adding automatic selection.

## Vendor Detail

### CodeSandbox SDK

#### Pricing

- Free tier: Build is $0 and includes 40 monthly VM-hours, 10 concurrent SDK VM sandboxes, private sandboxes, and VM sizes up to 4 vCPU / 8 GiB.
- Paid plan: Scale starts at $170/month per workspace and includes 160 VM-hours before add-ons.
- Overage: VM credits are listed at $0.015 each; the billing UI can add credits.
- Recurrence: The pricing page describes a monthly VM-credit allowance, making this the strongest ongoing free fallback of the candidates.

#### Core Features

- Direct support for shell execution, filesystem writes, preview ports, hibernation, resume-by-ID, and live VM forks.
- Hibernation stores a memory snapshot, and HTTP traffic to an exposed preview can wake a sandbox depending on configured auto-wake behavior.
- The vendor reports millions of VM starts/resumes per week and has operated its Firecracker infrastructure for several years. This is vendor-reported operational evidence, not an independent SLA measurement.

#### Limitations

- Free usage is enough for fallback, not unlimited capacity. The application must stop selecting CodeSandbox after its allowance is exhausted.
- A sandbox should not auto-wake from stale preview tabs indefinitely. Configure auto-wake deliberately and preserve Open Agents' server-authoritative inactivity logic.
- CodeSandbox is now part of Together AI. That is not a present technical defect, but it is a roadmap/vendor-concentration consideration.

### Modal Sandbox

#### Pricing

- Free tier: Starter is $0 and includes $30 in compute every month.
- Sandbox metering: CPU and memory are billed per second; the current Sandbox rate lists $0.00003942 per physical core-second and $0.00000667 per GiB-second.
- Storage: Volumes list $0.09/GiB/month with 1 TiB/month included on the pricing page.

#### Core Features

- TypeScript supports create, exec, reconnect by sandbox ID while running, detach, terminate, tunnels, filesystem APIs, environment variables, secrets, command timeouts, and outbound network policies.
- Filesystem snapshots can create a new sandbox from the prior filesystem state.
- Maximum sandbox lifetime is 24 hours, substantially above E2B Hobby's one-hour cap.

#### Limitations

- Once a Modal sandbox finishes or is terminated, it cannot execute again. Hibernation therefore means snapshot filesystem, terminate, and create a new sandbox later.
- Filesystem snapshots default to 30-day retention. Retention must be explicitly aligned with session retention.
- Memory snapshots are not the portable baseline to build around; filesystem snapshots are the stable cross-plan mechanism.

### Daytona

#### Pricing

- Free onboarding: Pricing advertises $200 in included compute and no credit card for the trial, but does not state that this credit recurs monthly.
- Usage pricing: $0.0504/vCPU-hour, $0.0162/GiB-hour RAM, and $0.000108/GiB-hour storage after the first 5 GiB.
- Tier 1 after email verification provides a 10-vCPU / 20-GiB RAM / 30-GiB storage organization pool according to the detailed limits table.

#### Core Features

- Sandboxes persist their filesystem across stop/start by default. VM pause/resume can preserve memory, and snapshots persist independently from their source sandbox.
- TypeScript APIs cover sync commands, long-running async sessions, filesystem transfer, signed preview URLs, stop/start, pause, snapshots, fork, TTL, and automatic lifecycle intervals.
- Stopped and paused sandboxes release CPU/RAM. VM state is offloaded so stopped VMs do not consume active disk quota.

#### Limitations

- Tier 1 and Tier 2 restrict network access to an official essential-services policy and do not permit per-sandbox overrides. GitHub, npm, Bun, PyPI, common model providers, and other development services are included, but arbitrary sites may be unreachable. Open Agents' browser/research behavior must be tested against the actual allowlist.
- The $200 credit is a trial pool, so Daytona cannot be called a perpetual free fallback based on current public pricing.

### E2B

#### Pricing

- Hobby has no monthly subscription and needs no card, but includes a one-time $100 usage credit.
- Default compute is billed per second; the current table lists two vCPUs at $0.000028/second plus memory and storage.
- Hobby allows up to 20 concurrent sandboxes but limits each session to one hour. Pro is $150/month plus usage and extends sessions to 24 hours.

#### Core Features

- Strong TypeScript APIs for commands, filesystem access, connect-by-ID, port hosts, uploads/downloads, and timeout changes.
- Sandboxes can pause and reconnect/resume in current SDK documentation.
- The abstraction is designed specifically for AI-generated code, so the adapter surface is straightforward.

#### Limitations

- The one-hour Hobby cap conflicts with Open Agents' current 40-minute Hobby / five-hour Standard runtime and 30-minute inactivity lifecycle. It leaves little safety margin for setup plus an agent run.
- The free credits are one-time, so E2B eventually reproduces the same exhaustion problem.

## Recommended Fallback Architecture

Use a provider chain, but choose a provider only when creating or restoring a sandbox:

`Vercel -> CodeSandbox -> Modal -> explicit capacity error`

Do not switch a live sandbox to another vendor after a command fails. A provider ID or snapshot is not portable, and retrying a mutating command elsewhere can duplicate or lose work.

### Safe selection rules

1. Persist `provider`, `sandboxId`, and provider-specific restore metadata in the session.
2. On new sandbox creation, try the configured provider order.
3. Fall through only for classified capacity conditions: exhausted credits/quota, account limit, provider capacity, or a circuit breaker opened by repeated transient provisioning failures.
4. Do not fall through for authentication, invalid configuration, policy rejection, bad source, or application/setup errors. Those need operator visibility.
5. Once creation succeeds, pin that session to the provider until a provider-neutral checkpoint exists.
6. For hibernated sessions, restore on the original provider first. Cross-provider recovery should start from a provider-neutral Git commit plus encrypted object-storage archive, not from a vendor snapshot ID.

### Minimal implementation shape

- Expand `SandboxState` into a discriminated union for `vercel`, `codesandbox`, and later `modal`.
- Add a provider registry instead of branching directly to Vercel in `connectSandbox`.
- Introduce normalized errors such as `SandboxCapacityError`, `SandboxAuthError`, `SandboxPolicyError`, and `SandboxProvisioningError` with `retryable` and `fallbackSafe` properties.
- Add `SANDBOX_PROVIDER_ORDER=vercel,codesandbox,modal` and individual enable/credential flags.
- Add a short-lived circuit breaker per provider so an outage does not make every request wait for the same timeout.
- Record selection reason, provisioning latency, failure class, free-quota exhaustion, restore success, and provider in telemetry.
- Generalize snapshot metadata to `{ provider, id, expiresAt?, kind }`.
- Replace provider-specific Git credential brokering in the shared interface with a scoped setup operation whose implementation guarantees token cleanup.

### Provider-neutral continuity

For truly seamless recovery after one provider is already running, add a checkpoint after each successful agent turn:

- commit or bundle the working tree without pushing user changes;
- upload an encrypted workspace archive or Git bundle to durable object storage;
- store the commit SHA, archive checksum, branch, working directory, and required runtime image version;
- never place secrets in the checkpoint;
- restore the checkpoint into a newly selected provider and rerun deterministic setup.

This is slower than same-provider resume, but it is the only safe way to move an in-progress workspace across vendors.

## Rollout Plan

1. Implement and contract-test a CodeSandbox adapter behind a disabled feature flag.
2. Run a compatibility probe covering clone, `pnpm install`, Bun tests, detached Next.js server, preview URL, Git credential cleanup, hibernate, and resume.
3. Add quota/error classification and fallback only for new sessions.
4. Shadow-check CodeSandbox availability without creating billable VMs, then enable for internal users.
5. Add provider-neutral checkpoints before enabling cross-provider restoration.
6. Add Modal only after CodeSandbox behavior and exhaustion handling are measured in production.

## Sources

### CodeSandbox

- [Pricing](https://codesandbox.io/pricing)
- [CodeSandbox SDK overview](https://codesandbox.io/sdk)
- [SDK official release and resume API](https://codesandbox.io/blog/codesandbox-sdk)
- [Infrastructure scale and SDK capabilities](https://codesandbox.io/blog/joining-together-ai-introducing-codesandbox-sdk)
- [Credit exhaustion now hibernates sandboxes](https://codesandbox.io/changelog/2025-04-04)

### Modal

- [Pricing](https://modal.com/pricing)
- [Sandbox guide](https://modal.com/docs/guide/sandboxes)
- [JavaScript Sandbox reference](https://modal.com/docs/sdk/js/latest/Sandbox)
- [Filesystem snapshots](https://modal.com/docs/guide/sandbox-snapshots)
- [Sandbox resources and pricing](https://modal.com/docs/guide/sandbox-resources)

### Daytona

- [Pricing](https://www.daytona.io/pricing)
- [Limits](https://www.daytona.io/docs/limits)
- [Persistence and lifecycle](https://www.daytona.io/docs/en/persistence/)
- [TypeScript Sandbox API](https://www.daytona.io/docs/en/typescript-sdk/sandbox/)
- [TypeScript Process API](https://www.daytona.io/docs/en/typescript-sdk/process/)
- [Network restrictions and essential services](https://www.daytona.io/docs/en/network-limits/)

### E2B

- [Pricing](https://e2b.dev/pricing)
- [JavaScript Sandbox API](https://e2b.dev/docs/sdk-reference/js-sdk/v2.11.1/sandbox)

