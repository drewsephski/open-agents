# Task 3 Implementer Report: Explicit Inference Authorization

## Outcome

Implemented a single server-side inference credential resolver and propagated explicit OpenRouter configuration through every current authenticated model-call path. Authenticated inference now fails closed without a valid User BYOK credential; no authenticated model factory can silently use the deployment `OPENROUTER_API_KEY`.

The default model remains `z-ai/glm-5.3-flash`. Managed inference is represented in the resolver contract, but its production state loader intentionally reports unavailable until subscription, managed-key, and allowance persistence arrive in later tasks.

## Implementation

- Added `lib/access/model-credential-resolver.ts` as the authorization and credential resolution boundary.
  - Loads access state by User ID.
  - Evaluates the shared inference access policy.
  - Decrypts only the selected credential server-side.
  - Returns structured, safe remediation failures and converts them to HTTP 403 responses.
  - Catches state-load and decrypt failures without logging provider errors or credential material.
- Added `lib/ai/authenticated-model.ts` so authenticated helpers re-authorize immediately before constructing a language model.
- Made `ModelFactoryOptions.config` required in `packages/agent`; `model()` and `defaultLanguageModel()` no longer have an implicit deployment-key path.
- Added explicit main-agent OpenRouter configuration and a required subagent authorization callback to `OpenAgentCallOptions`.
- Gated chat admission after ownership/archive validation and before active-workflow reconciliation, message persistence, workflow creation, or sandbox activity.
- Re-authorized the main agent within every durable `runAgentStep` and each subagent immediately before every AI SDK provider step; plaintext keys exist only in local call memory and are not present in workflow input, events, sandbox state, or sandbox environment.
- Routed title generation, manual and automatic commit-message helpers, PR generation helpers, and check-log compaction through the authenticated model boundary.
- Replaced the stack recommender's implicit deployment key with the separately named `OPENROUTER_PUBLIC_DEMO_API_KEY` path.
- Removed the hosted five-message inference trial and `@vercel.com` privilege. Hosted deployment model filtering no longer grants or denies authenticated inference; central access policy owns that decision.

## TDD Evidence

RED was observed before implementation:

1. Resolver test failed because `model-credential-resolver` did not exist.
2. Chat-admission test expected a structured 403 but received 200 and workflow creation proceeded.
3. Agent factory test showed a model could still be created from `OPENROUTER_API_KEY` without explicit configuration.
4. Workflow test observed no credential resolution calls at the agent-step boundary.

GREEN after the implementation:

- Resolver: 4 tests passed (BYOK, missing-source remediation, managed contract, failure redaction).
- Authenticated/public-demo model helpers: 3 tests passed.
- Chat route: 22 tests passed, including pre-persistence denial and workflow-payload secret exclusion.
- Durable chat workflow: 39 tests passed, including per-step main/subagent resolution.
- Agent models: 19 tests passed, including refusal to use a populated deployment key implicitly.
- Focused title, stack recommendation, auto-commit, model access, model API, preferences, and model-variant route suites passed.
- `pnpm run ci` passed: format/lint, workspace typecheck, 138 isolated test files, and migration consistency. The live OpenRouter smoke test was skipped because no operational key was configured.
- `git diff --check` passed.

The first full CI run correctly exposed one stale hosted-model API assertion. Its expectation was updated to the new central-policy behavior, and the complete CI suite then passed.

## Model-Call Audit

Production model factories found by `rg`:

- `apps/web/lib/ai/authenticated-model.ts`: central authenticated resolver, explicit config.
- `apps/web/lib/ai/recommend-tech-stack.ts`: explicit public-demo config supplied by the route.
- `packages/agent/open-agent.ts`: explicit main config plus per-provider-call subagent authorization/model construction.
- `packages/agent/models.ts`: factory implementation only; configuration is required.
- `defaultLanguageModel()` has no production caller after this change.

Authenticated AI boundaries audited:

- Main agent: `apps/web/app/workflows/chat.ts`.
- Subagents: `packages/agent/tools/task.ts` and `packages/agent/subagents/model-runtime.ts`, resolving and constructing a fresh authorized model in each subagent `prepareStep` provider boundary.
- Session titles: `apps/web/app/api/generate-title/route.ts`.
- Manual commit messages: `apps/web/app/api/sessions/[sessionId]/generate-commit-message/route.ts`.
- Automatic/action commit messages: `apps/web/lib/chat/auto-commit-direct.ts`, `apps/web/lib/git/helpers.ts`, and `apps/web/lib/github/actions/commit.ts`.
- PR content/manual/automatic helpers: `apps/web/lib/github/pr-content.ts`, `apps/web/app/api/generate-pr/route.ts`, `apps/web/lib/chat/auto-pr-direct.ts`, and `apps/web/lib/github/actions/pr.ts`.
- Check-log compaction: `apps/web/app/api/sessions/[sessionId]/checks/fix/route.ts`.

## Security Review

- Plaintext credentials are produced only by the server-only resolver and passed directly to in-memory model construction.
- Chat admission deliberately discards its resolved credential and the workflow independently re-authorizes at each agent step.
- Durable input types explicitly omit `openRouter` and `resolveSubagentOpenRouter`; tests verify workflow start arguments do not serialize resolved keys or authorization callbacks.
- No credential is added to message data, workflow events, logs, sandbox state, or sandbox environment.
- Provider/decryption errors are reduced to `access_state_invalid` plus `retry_later`; API responses never include the raw exception.
- Authenticated product inference has no fallback to `OPENROUTER_API_KEY`, even when that variable is populated.

## Intentional Deferrals and Operational Paths

- Production managed inference state is fail-closed (`subscription: null`, managed key missing) until the Stripe/subscription, managed subkey, and allowance work lands. The resolver dependency contract and tests already support managed state without using a deployment key.
- `packages/agent/model-catalog.ts` may still use `OPENROUTER_API_KEY` for the OpenRouter model-metadata GET. It does not invoke inference and is an operational catalog path, not authenticated product authorization.
- `packages/agent/open-agent.smoke.test.ts` explicitly passes `OPENROUTER_API_KEY` only for an opt-in live operational test.
- The unauthenticated stack recommender is the sole public-demo inference path and requires `OPENROUTER_PUBLIC_DEMO_API_KEY`; it explicitly refuses to fall back to `OPENROUTER_API_KEY`.
- Subagent `ToolLoopAgent` calls re-authorize in asynchronous `prepareStep`, the AI SDK boundary immediately before each provider call; a revocation between tool-loop steps stops the run before another provider request.

## Environment Note

The repository requests Node 24.x; verification ran under Node 26.3.0 and emitted the existing engine warning. All required checks nevertheless passed.

## Fix Round 1

### Changes

- Removed the default parameter from `requireOpenRouterApiKey`. Passing `{ config: { apiKey: undefined } }` can no longer consult `OPENROUTER_API_KEY`; operational catalog code must pass its environment value explicitly.
- Updated `MissingOpenRouterApiKeyError` to say `Explicit OpenRouter API key configuration is required.`
- Removed the module-global OpenRouter provider cache. User-scoped provider instances and plaintext key cache keys are no longer retained across model factory calls.
- Replaced the one-time `subagentOpenRouter` value with a required `resolveSubagentOpenRouter` callback created inside the durable agent step.
- Added a subagent model runtime shared by executor, explorer, and design agents. Every subagent `prepareStep` re-runs authorization and constructs a fresh model immediately before its provider call.
- The fallback subagent selection also uses the per-call resolver, so task-tool calls remain protected when no dedicated subagent model is configured.

### RED Evidence

1. The explicit-key regression supplied `{ config: { apiKey: undefined } }` while `OPENROUTER_API_KEY` was populated; the factory returned a model instead of throwing.
2. The provider-retention regression constructed the same user-scoped model twice; `createOpenRouter` was called only once because the module-global cache retained it.
3. The real executor subagent test issued a first-step `read` tool call and configured authorization to revoke before step two; the old call schema rejected the resolver and therefore could not re-authorize at the second provider boundary.

### GREEN Evidence

- `packages/agent/models.test.ts`: 20 passed, including undefined explicit-key rejection and no provider reuse.
- `packages/agent/subagents/authorization.test.ts`: 1 passed; the resolver ran twice across a real two-step tool loop, the first authorized model made exactly one provider call, and revocation rejected the run before a second provider call.
- `apps/web/app/workflows/chat.test.ts`: 39 passed; the callback performs a fresh central credential resolution on every invocation and is never durable input.
- Focused model catalog, tools, chat route, and smoke suites passed independently; the live OpenRouter smoke remained skipped without an operational key.
- `pnpm run ci` passed: format/lint, workspace typecheck, 139 isolated test files, and migration consistency.
- `git diff --check` passed.
