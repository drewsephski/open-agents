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
- Added explicit main-agent and subagent OpenRouter configuration to `OpenAgentCallOptions`, including runtime validation that a selected subagent model has a separately supplied configuration.
- Gated chat admission after ownership/archive validation and before active-workflow reconciliation, message persistence, workflow creation, or sandbox activity.
- Re-authorized main-agent and selected subagent credentials within every durable `runAgentStep`; the plaintext key exists only in local step memory and is not present in workflow input, events, sandbox state, or sandbox environment.
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
- `packages/agent/open-agent.ts`: explicit main and subagent configs supplied by each durable agent step.
- `packages/agent/models.ts`: factory implementation only; configuration is required.
- `defaultLanguageModel()` has no production caller after this change.

Authenticated AI boundaries audited:

- Main agent: `apps/web/app/workflows/chat.ts`.
- Subagents: `packages/agent/tools/task.ts`, using the separately authorized model constructed at the same durable agent-step boundary.
- Session titles: `apps/web/app/api/generate-title/route.ts`.
- Manual commit messages: `apps/web/app/api/sessions/[sessionId]/generate-commit-message/route.ts`.
- Automatic/action commit messages: `apps/web/lib/chat/auto-commit-direct.ts`, `apps/web/lib/git/helpers.ts`, and `apps/web/lib/github/actions/commit.ts`.
- PR content/manual/automatic helpers: `apps/web/lib/github/pr-content.ts`, `apps/web/app/api/generate-pr/route.ts`, `apps/web/lib/chat/auto-pr-direct.ts`, and `apps/web/lib/github/actions/pr.ts`.
- Check-log compaction: `apps/web/app/api/sessions/[sessionId]/checks/fix/route.ts`.

## Security Review

- Plaintext credentials are produced only by the server-only resolver and passed directly to in-memory model construction.
- Chat admission deliberately discards its resolved credential and the workflow independently re-authorizes at each agent step.
- Durable input types explicitly omit `openRouter` and `subagentOpenRouter`; tests verify workflow start arguments do not serialize the resolved key.
- No credential is added to message data, workflow events, logs, sandbox state, or sandbox environment.
- Provider/decryption errors are reduced to `access_state_invalid` plus `retry_later`; API responses never include the raw exception.
- Authenticated product inference has no fallback to `OPENROUTER_API_KEY`, even when that variable is populated.

## Intentional Deferrals and Operational Paths

- Production managed inference state is fail-closed (`subscription: null`, managed key missing) until the Stripe/subscription, managed subkey, and allowance work lands. The resolver dependency contract and tests already support managed state without using a deployment key.
- `packages/agent/model-catalog.ts` may still use `OPENROUTER_API_KEY` for the OpenRouter model-metadata GET. It does not invoke inference and is an operational catalog path, not authenticated product authorization.
- `packages/agent/open-agent.smoke.test.ts` explicitly passes `OPENROUTER_API_KEY` only for an opt-in live operational test.
- The unauthenticated stack recommender is the sole public-demo inference path and requires `OPENROUTER_PUBLIC_DEMO_API_KEY`; it explicitly refuses to fall back to `OPENROUTER_API_KEY`.
- The subagent AI SDK call is synchronous around a model object, so the narrowest current re-authorization point is the enclosing durable agent step, immediately before both main and selected-subagent models are constructed.

## Environment Note

The repository requests Node 24.x; verification ran under Node 26.3.0 and emitted the existing engine warning. All required checks nevertheless passed.
