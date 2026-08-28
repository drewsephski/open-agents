# Launchstack

Launchstack lets people run coding agents against their software projects while keeping access, billing, and model usage attributable to the person who initiated the work.

## Language

**User**:
The authenticated person who owns provider credentials, a Pro subscription, and the associated managed inference allowance. A User's access and allowance apply across all of their repositories, sessions, chats, main agents, and subagents.
_Avoid_: Customer, account, repository owner

**Pro Subscription**:
A User-owned recurring purchase that grants immediate access to platform-funded managed inference for paid billing periods. It does not include an unpaid trial.
_Avoid_: Paid account, repository plan

**Managed Inference Allowance**:
The dollar amount of platform-funded model usage available to one User during one paid Pro Subscription billing period across all agent activity. Unused allowance expires at the end of that period and does not roll over.
_Avoid_: Credits, repository quota, message limit

**Allowance Period**:
The paid billing period during which one Managed Inference Allowance can be consumed, bounded by the Pro Subscription's verified period start and end.
_Avoid_: Calendar month, rolling month

**Paid-Through Access**:
Managed inference access available only while a Pro Subscription is financially active, including the remainder of a period scheduled to cancel. Delinquent, paused, expired, canceled, fully refunded, and disputed subscriptions do not provide managed inference access.
_Avoid_: Grace period, permanent Pro access

**BYOK Inference**:
Model usage paid through a User's own OpenRouter credential. BYOK Inference does not consume the User's Managed Inference Allowance.
_Avoid_: Free inference, managed fallback

**Managed Inference**:
Model usage funded by Launchstack for a User with Paid-Through Access and charged against that User's Managed Inference Allowance.
_Avoid_: Shared key usage, unlimited inference

**Credential Routing**:
The managed-first selection policy for model usage: eligible models use Managed Inference while available, then BYOK Inference; models outside the managed catalog use BYOK Inference directly.
_Avoid_: User billing mode, random provider fallback

**Workspace AI Activity**:
Authenticated, User-initiated model usage across agent turns, subagents, and model-powered workspace helpers such as titles, commit messages, pull-request content, and automated fixes. Deterministic sandbox and repository operations are not Workspace AI Activity.
_Avoid_: Chat messages only, sandbox usage

**Managed Model Catalog**:
The small set of reliable, cost-predictable, tool-capable models eligible for Managed Inference. `z-ai/glm-5.3-flash` is the default managed model and remains in this catalog.
_Avoid_: Every OpenRouter model, cheapest models

**Paused Run**:
An agent run that cannot begin its next model call until the User restores eligible inference access. Completed messages and tool effects remain part of the run and are not repeated when it resumes.
_Avoid_: Failed run, canceled run

**Pending Prompt**:
An unsent composer draft preserved when a User attempts to start Workspace AI Activity without eligible inference access. It is not a chat message or agent run and requires an explicit send after access is restored.
_Avoid_: Queued run, failed message

**Administrative Inference**:
Operational model usage explicitly authorized for a Launchstack administrator through a separately limited internal credential. It is not a customer entitlement and does not consume a User's Managed Inference Allowance.
_Avoid_: Vercel employee access, hidden Pro access

**Provider Connection**:
A reusable, User-owned authorization relationship with an external coding-agent runtime such as Codex or OpenCode. It applies across the User's repositories and sessions and remains distinct from repository access and OpenRouter credentials.
_Avoid_: Sandbox login, repository connection, model key

**Inference Source**:
The authorization and payment source eligible to power a selected Execution Backend: OpenRouter BYOK, Paid-Through Access for Launchstack Native, or that backend's valid Provider Connection.
_Avoid_: API key, Pro-only access, model

**Execution Backend**:
The coding-agent runtime assigned to one chat, such as Launchstack Native, Codex, or OpenCode. An Execution Backend remains fixed for the life of that chat.
_Avoid_: Model, connection, switchable chat provider

**Backend Fork**:
A new chat created to continue work through a different Execution Backend using an explicit summary and the repository's current state. Provider-private session history, pending approvals, and runtime state do not cross the fork.
_Avoid_: Backend switch, session migration

**Sandbox Allowance**:
The wall-clock time a User may keep platform-funded coding sandboxes running during an applicable Sandbox Period. BYOK access includes two hours with one concurrent Running Sandbox; Pro includes twenty-five hours with two concurrent Running Sandboxes.
_Avoid_: Managed Inference Allowance, CPU credits, unlimited workspace time

**Sandbox Period**:
The window during which a Sandbox Allowance can be consumed. The free BYOK period is one UTC calendar month; the Pro period is the User's paid subscription billing period.
_Avoid_: Allowance Period, rolling thirty days

**Running Sandbox**:
A provisioned coding environment that is active or waiting and therefore consuming billable infrastructure. It hibernates after fifteen minutes without User or workflow activity; a stopped or hibernated persistent sandbox is not a Running Sandbox.
_Avoid_: Repository, session, saved sandbox
