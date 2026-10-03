# Sandbox Services Vendor Comparison

Research date: October 2, 2026

Use case: Launchstack's cloud coding agents cloning repositories, editing files, installing dependencies, running tests, serving previews, and preserving work between chat turns.

Budget: Prefer an ongoing $0 allowance. Distinguish recurring credits, free limited compute, signup trials, and free software that requires owned infrastructure.

Team size: Assumed small product team; the service must support multiple user sessions.

## Executive Recommendation

- **First new provider to implement: Modal.** Recurring compute credits, a server-side TypeScript SDK, configurable resources, and filesystem snapshots make it the best next addition under the ongoing-free requirement.
- **First existing integration to verify: CodeSandbox.** The adapter is already present. Confirm its account allowance and run the existing live probe before spending time replacing it.
- **Best strictly free experiment: Tensorlake.** Its advertised ongoing free plan is useful for a single small workspace. Its resource and concurrency limits make it a poor default for a multi-user Next.js coding product.
- **Best trial-funded lifecycle candidate: Daytona.** Persistent stop/start closely matches the app, but the advertised trial is not a verified recurring monthly allowance.
- **Highest mismatch for this request: Cloudflare Sandboxes.** It needs a paid Workers plan and an additional Worker control plane. Consider it if the application later adopts Cloudflare infrastructure.

These are engineering judgments based on the current checkout and public documentation, not measured performance rankings or live account entitlements.

## What the Current Code Actually Needs

The current implementation has **Vercel and CodeSandbox**, with new provisioning ordered `vercel,codesandbox`. CodeSandbox is skipped without credentials. Established sessions reconnect only to their saved provider. Quota/capacity failures can fall back during new provisioning; commands and existing workspaces never migrate automatically.

Relevant local sources:

- [Shared sandbox contract](../packages/sandbox/interface.ts): text/binary files, stat, directory listing, command results, detached processes, scoped GitHub authentication, previews, stop, and restore metadata.
- [Factory and provider registry](../packages/sandbox/factory.ts): provider selection, reconnect, and safe fallback.
- [Provider configuration](../apps/web/lib/sandbox/provider-config.ts): ordered providers and credentials.
- [Runtime configuration](../apps/web/lib/sandbox/config.ts): approximately 40-minute Hobby / five-hour Standard sessions, 15-minute inactivity, and ports 3000, 5173, 4321, and 8000.
- [Lifecycle](../apps/web/lib/sandbox/lifecycle.ts): calls `stop()`, then saves `getState()` after inactivity. A new adapter's `stop()` must preserve recoverable work.
- [State helpers](../apps/web/lib/sandbox/utils.ts): currently recognize only Vercel and CodeSandbox restore shapes.
- [Existing live probe](../scripts/codesandbox-live-probe.ts) and [fallback operations](../docs/sandbox-provider-fallback.md).

The older August comparison predates the current provider implementation. Its statement that the factory only accepts Vercel is no longer accurate. Adapter presence does not prove deployment, credentials, or live lifecycle behavior.

## Comparison Table

Weights: workspace/lifecycle fit 40%, ongoing free value 25%, integration effort 20%, and operational risk 15%. Scores are directional judgments; support and reliability have not been benchmarked.

| Provider | Free usage / pricing | Fit and integrations | Support / material risk | Score |
| --- | --- | --- | --- | --- |
| **CodeSandbox** — existing | Indexed official Build pricing lists 40 VM-credit hours/month and 10 concurrent SDK VMs | Implemented TypeScript adapter; native hibernate/resume | Direct pricing fetch returned 403; indexed pricing was several months old. Verify dashboard entitlement | 9/10, provisional |
| **Modal** — add first | $30 compute credit every month; $0 Starter subscription | Official JS/TS client; commands, files, tunnels, custom images, snapshots | Community Slack; stable restore recreates runtime/processes; JS/Go SDK guide labeled Beta | 8.5/10 |
| **Tensorlake** — constrained experiment | Ongoing $0 plan: one sandbox, 1 vCPU, 1 GB RAM, 10 GB disk, two-hour sessions | TypeScript; named suspend/resume and memory/filesystem state | Seven-day free-plan retention; resource limits and public terms need resolution for customer workspaces | 6.5/10 |
| **Daytona** — trial candidate | $200 free trial compute; recurring refresh not established | TypeScript; persistent stop/start, files, async process sessions, previews | Lower-tier outbound restrictions; disk can bill while stopped | 7.5/10 |
| **E2B** — short-session candidate | $100 explicitly one-time credit; Hobby one-hour sessions / 20 concurrent | TypeScript; files, commands, previews, memory-preserving pause/resume | Standard app's five-hour profile exceeds Hobby limit; Pro $150/month plus usage | 6.5/10 |
| **Blaxel** — paid lifecycle candidate | Up to $200 credits; monthly replenishment not established | TypeScript; full-state standby/resume, previews | Discord; standby snapshot storage bills even with zero compute | 7/10 |
| **Beam** — watchlist | Developer $0 subscription **plus usage**; recurring free compute not confirmed on current pricing | TypeScript; process/file/network/snapshot APIs | Older vendor articles mention $30/month, but current pricing/billing pages did not confirm it | 6/10 |
| **Cloudflare Sandboxes** — later | Workers Paid minimum $5/month plus resource usage | Linux containers, previews, files; Worker and Durable Object integration | Additional deployed control plane; container scheduling in public beta | 5/10 |
| **OpenSandbox** — self-hosted | Apache-2.0 software; hardware/cloud and operations paid by us | TypeScript SDK, Docker/Kubernetes, ingress/egress; Firecracker pause/resume path | Own availability, isolation, upgrades, storage, and networking | 6/10 for hosted product; stronger for owned infrastructure |
| **microsandbox** — local/self-hosted | Apache-2.0 software; requires owned runtime infrastructure | Programmable local microVM runtime with JS support | Must supply hosted fleet, authenticated control plane, previews, and recovery | 5/10 for hosted product |

Pricing sources: [CodeSandbox](https://codesandbox.io/pricing), [Modal](https://modal.com/pricing), [Tensorlake](https://www.tensorlake.ai/pricing), [Daytona](https://www.daytona.io/pricing), [E2B](https://e2b.dev/pricing), [Blaxel](https://blaxel.ai/pricing), [Beam](https://www.beam.cloud/pricing), [Cloudflare Containers](https://developers.cloudflare.com/containers/platform/pricing/), [OpenSandbox](https://github.com/opensandbox-group/OpenSandbox), [microsandbox](https://github.com/superradcompany/microsandbox).

## Vendor Details and Decision-Relevant Limitations

### Modal

The [`modal` JavaScript SDK](https://github.com/modal-labs/modal-client/blob/main/js/README.md) requires Node 22+, which fits the repository's Node 24 tooling. SDK clients belong inside Workflow steps; persist plain IDs and restore metadata between steps. Next.js/Workflow bundling still needs an actual deployment probe.

Use stable [filesystem snapshots](https://modal.com/docs/guide/sandbox-snapshots) for the first adapter. They default to 30-day retention. Memory snapshots are Alpha, default to seven days, and have background-process limitations. Stable [sandboxes](https://modal.com/docs/guide/sandboxes) cannot execute again after termination and support up to 24-hour runs. Restoring files therefore means creating a new instance and restarting the preview/editor.

[Files](https://modal.com/docs/guide/sandbox-files) and [networking](https://modal.com/docs/guide/sandbox-networking) cover the principal tool surface. Cache each created tunnel URL to implement the shared synchronous `domain(port)` method, then refresh URLs after restoration. Keep Launchstack's activity tracking authoritative: provider idle detection can treat open previews and running commands as activity.

Estimated free capacity at published **Sandbox-specific** rates: 1 physical core (2 vCPU equivalent) plus 4 GiB is about **$0.238/hour**, or **126 hours/month** from $30; 2 physical cores plus 8 GiB is about **$0.476/hour**, or **63 hours/month**. Calculation assumes these billed CPU/memory quantities, base-region pricing, and no other consumption. Credits are shared across the workspace; image preparation and other resources reduce capacity. This is not a guaranteed monthly runtime quota. [Pricing](https://modal.com/pricing).

For the $0 target, set an explicit Workspace spend limit and usage budget before rollout. Modal distinguishes net spending after credits from usage before credits; do not assume a $30 usage limit and $30 spending limit mean the same thing. Verify enforcement on the account. [Budgets](https://modal.com/docs/guide/budgets).

### CodeSandbox

Best immediate reuse: this checkout already has the adapter, credential cleanup, provider error handling, and hibernate state. Indexed [official pricing](https://codesandbox.io/pricing) describes a monthly allowance, SDK-specific creation/request limits, and a $170/month Scale tier. VM credits measure size-dependent runtime; do not interpret the displayed 40 hours as 40 hours at every machine size.

Confidence is lower for fresh pricing because direct retrieval was blocked and the indexed source was older. Run `pnpm sandbox:probe:codesandbox` with an authorized key, then test controlled provisioning fallback. Never infer live readiness from unit tests or source presence.

### Tensorlake

The [free plan](https://www.tensorlake.ai/pricing) advertises unmetered sessions without a card, but only one small concurrent sandbox and seven-day retention. Paid usage begins with $5 prepaid packs; Pro is $250 per billing cycle. The free resource profile needs real `pnpm install`, Next.js, Bun, and code-server testing before any recommendation for regular use.

[Named suspend/resume](https://www.tensorlake.ai/blog/suspend-vs-snapshot) preserves memory, processes, and filesystem under the same ID; unnamed ephemeral sandboxes cannot suspend. TypeScript examples and lifecycle documentation make it promising technically. Confirm free-plan access to the required lifecycle and preview APIs rather than extrapolating from the general product feature list.

Its September 17 [public terms](https://www.tensorlake.ai/terms) restrict use benefiting third parties unless otherwise allowed, and the free-offering clause treats uploaded files/content as Usage Data. The applicable Order Form can override the agreement. Until the vendor clarifies terms for an embedded customer-workspace product, use this candidate for public sample-repository experiments; do not assume it is suitable for private customer code. This is a specific adoption question raised by the published terms, not a legal conclusion about an account we have not opened.

### Daytona

Strong workspace fit: [persistent files and stop/start](https://www.daytona.io/docs/en/persistence/) align with saved coding sessions. Its [trial pricing](https://www.daytona.io/pricing) lists $0.0504/vCPU-hour and $0.0162/GiB-hour RAM, then storage beyond the free allocation. No verified recurring monthly grant was found.

[Tier 1/2 networking](https://www.daytona.io/docs/en/network-limits/) allows essential services but prevents per-sandbox overrides of organization restrictions. Test repository, registry, third-party API, and browser destinations. [Billing](https://www.daytona.io/docs/billing) distinguishes persistent/ephemeral runtimes and charges reserved disk while stopped or paused. A zero-compute idle state is not necessarily a zero-cost state.

### E2B

The [$100 grant is explicitly one-time](https://e2b.dev/pricing). Hobby's one-hour active session limit fits short tasks and the current Hobby profile, but not the Standard profile without provider-specific caps. Pro raises the limit to 24 hours with an additional monthly subscription.

E2B is **not stateless-only**: current [persistence docs](https://docs.e2b.dev/sandbox/persistence) support memory-preserving pause/resume. They also describe snapshot-busy handling and filesystem-only fallback during prolonged auto-pause backlog. Adapter behavior must distinguish restored files from restored processes and restart previews when necessary.

### Blaxel

Good lifecycle shape, weaker ongoing-free evidence. [Pricing](https://blaxel.ai/pricing) advertises up to $200 credits and zero standby compute; replenishment was not established. Active runtime is memory-size based, snapshot storage is $0.20/GB-month, and volumes are $0.12/GB-month. Avoid treating suspended workspaces as completely free. [TypeScript SDK documentation](https://docs.blaxel.ai/sdk-reference/introduction) provides an integration path; preview-driven wake and cost controls need a probe.

### Beam

[Current docs](https://docs.beam.cloud/v2/sandbox/overview) support TypeScript sandboxes, captured command results, detached process handles, files, previews, and snapshots. Technical fit is plausible. Current [pricing](https://www.beam.cloud/pricing) and [billing docs](https://docs.beam.cloud/v2/resources/pricing-and-billing) did not confirm the $30 monthly free compute described in older vendor articles. Keep it off the free-provider shortlist until account entitlement is confirmed.

### Cloudflare, OpenSandbox, and microsandbox

[Cloudflare](https://developers.cloudflare.com/sandbox/) has real Linux sandboxes, but they operate through Workers. A Vercel-hosted app would need a separate authenticated Worker service; the paid-plan requirement defeats the strict $0 goal.

[OpenSandbox](https://github.com/opensandbox-group/OpenSandbox) is the better self-hosted platform candidate for this architecture: shared execution/lifecycle APIs and TypeScript, with Docker and Kubernetes deployment paths. Its Firecracker runtime supports pause/resume. Deploying the Docker starter alone does not establish the production isolation and persistence guarantees of that runtime.

[microsandbox](https://github.com/superradcompany/microsandbox) is useful for local microVM execution. For this SaaS, the missing work is operating a secure remote fleet and durable session service. Free software cannot create free hosted compute, and these runtimes cannot be hosted inside ordinary Vercel Functions.

## Recommended First Implementation

Add **Modal as an opt-in third provider** after Vercel and CodeSandbox. Do not implement several providers at once.

1. Add focused `packages/sandbox/modal/` modules for configuration, state, connection, execution/files, and error classification. Use the official TypeScript SDK with a pinned compatible version.
2. Extend provider/state/snapshot unions, factory registration, web provider validation, and state helpers. Persist Modal sandbox ID, snapshot image ID, expiration, and relevant runtime configuration. The existing session column is JSON; inspect circuit/billing provider constraints before deciding whether a database migration is necessary.
3. Match current lifecycle: `stop()` must checkpoint before terminating, and `getState()` must expose the saved snapshot. Preserve a recoverable live state if checkpointing fails. Restore creates a new sandbox, updates IDs/preview URLs, and restarts the editor/preview without recloning over user edits.
4. Provide a prepared Node/pnpm/Bun/git runtime and sufficient memory. Keep credentials outside persisted state; use the existing scoped Git authentication model and verify cleanup before snapshots. Implement abort, output truncation, exit status, binary files, and detached-process tracking.
5. Introduce provider-specific resource and timeout capabilities. Do not pass Vercel assumptions such as a native snapshot ID, five-hour default, or timeout-extension semantics to every provider. Stop and checkpoint before a terminal timeout; do not claim timeout extension if unsupported.
6. Reuse new-provisioning fallback and the durable circuit breaker. Continue restoring established sessions on their original provider. No cross-provider replay of commands or recovery from an opaque vendor snapshot.
7. Add an opt-in live probe: clone a private test repo, install dependencies, run a Bun test, edit text/binary files, start detached Next.js and code-server, verify HTTP and WebSocket previews, checkpoint after credential cleanup, restore edited/untracked files, and confirm preview restart and clean teardown.
8. Run repository CI, then a Vercel preview deployment probe. Configure budget controls and exercise quota fallback before enabling wider use.

For a hard $0 budget, stop allocating new sessions when free allowance is exhausted and show an actionable capacity message. Trial credits cannot substitute for a sustainable allowance. If the budget becomes a few dollars of pay-as-you-go usage, Daytona and Tensorlake's prepaid tier deserve a second look.

## Evidence Limits and User Sentiment

No account signup, billable sandbox creation, deployment, or live provider benchmark was performed. Community search results were sparse and often vendor-affiliated; there is no defensible independent reliability or support ranking from those anecdotes. Documentation quality and explicit API limits drove the recommendation. Current SDK pages remain the implementation authority; verify exact pinned SDK types before coding.

The research report and a repository lesson are the only edits from this task. Existing concurrent product changes were preserved.

## Sources

- **Modal:** [Pricing](https://modal.com/pricing), [JS SDK](https://github.com/modal-labs/modal-client/blob/main/js/README.md), [Sandboxes](https://modal.com/docs/guide/sandboxes), [Snapshots](https://modal.com/docs/guide/sandbox-snapshots), [Files](https://modal.com/docs/guide/sandbox-files), [Networking](https://modal.com/docs/guide/sandbox-networking), [Budgets](https://modal.com/docs/guide/budgets).
- **CodeSandbox:** [Pricing, retrieved through indexed official results](https://codesandbox.io/pricing), plus current local adapter and operational documentation linked above.
- **Tensorlake:** [Pricing](https://www.tensorlake.ai/pricing), [Suspend versus snapshot](https://www.tensorlake.ai/blog/suspend-vs-snapshot), [Official SDK repository](https://github.com/tensorlakeai/tensorlake), [Current terms](https://www.tensorlake.ai/terms).
- **Daytona:** [Pricing](https://www.daytona.io/pricing), [Persistence](https://www.daytona.io/docs/en/persistence/), [Network limits](https://www.daytona.io/docs/en/network-limits/), [Billing](https://www.daytona.io/docs/billing).
- **E2B:** [Pricing](https://e2b.dev/pricing), [Persistence](https://docs.e2b.dev/sandbox/persistence).
- **Blaxel:** [Pricing](https://blaxel.ai/pricing), [SDKs](https://docs.blaxel.ai/sdk-reference/introduction).
- **Beam:** [Pricing](https://www.beam.cloud/pricing), [Sandbox API overview](https://docs.beam.cloud/v2/sandbox/overview), [Billing](https://docs.beam.cloud/v2/resources/pricing-and-billing).
- **Cloudflare:** [Current sandbox overview](https://developers.cloudflare.com/sandbox/), [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/).
- **Self-hosted:** [OpenSandbox](https://github.com/opensandbox-group/OpenSandbox), [microsandbox](https://github.com/superradcompany/microsandbox).
- **Existing Vercel baseline:** [Sandbox quotas](https://vercel.com/docs/sandbox/pricing), [Hobby usage restriction](https://vercel.com/docs/plans/hobby). Hobby is restricted to personal non-commercial use; do not budget a commercial Launchstack deployment around that tier. This report does not verify the deployed Vercel plan.
