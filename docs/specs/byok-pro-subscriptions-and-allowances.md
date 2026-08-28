## Problem Statement

Launchstack currently depends on one deployment-wide OpenRouter credential and a hosted-demo message limit. A normal User cannot provide their own OpenRouter credential, subscribe for platform-funded inference, understand or control model and sandbox spending, or recover cleanly when access is unavailable. This creates an unsafe shared-secret and shared-spend model, makes hosted access difficult to monetize, and leaves future coding-agent backends coupled to the existing OpenRouter-only runtime.

## Solution

Launchstack will offer two explicit access paths for Launchstack Native. BYOK gives a User access with their own encrypted, write-only OpenRouter credential and a bounded free Sandbox Allowance. Pro costs $29 per month and provides Paid-Through Access, a $10 Managed Inference Allowance, a larger Sandbox Allowance, and automatic BYOK fallback. Stripe Billing and verified webhooks control paid entitlement; PostgreSQL holds the application read model. Every authenticated Workspace AI Activity call resolves through one server-side access-policy boundary, and every managed User receives an isolated, limited OpenRouter subkey rather than sharing an unrestricted completion key.

The implementation also introduces the minimal Execution Backend identity needed for future Codex and OpenCode adapters, while live connectors remain a separate project.

## User Stories

1. As a new User, I want onboarding to explain OpenRouter BYOK and Pro clearly, so that I understand how I can run agents.
2. As a new User, I want to finish onboarding without entering a key, so that I can inspect the product before deciding how to fund inference.
3. As a User without an Inference Source, I want my first attempted prompt preserved as a Pending Prompt, so that I do not lose my work.
4. As a User without an Inference Source, I want no message, run, or sandbox created when access is blocked, so that I am not charged and my history remains truthful.
5. As a User who restores access, I want to explicitly resend my Pending Prompt, so that Launchstack never starts work unexpectedly after validation or Checkout.
6. As a BYOK User, I want to add my OpenRouter credential once, so that Launchstack Native can run across all my repositories and chats.
7. As a BYOK User, I want my credential encrypted and write-only, so that neither the browser nor later API responses can retrieve it.
8. As a BYOK User, I want to see only redacted credential metadata and validation status, so that I can identify the configured key safely.
9. As a BYOK User, I want to replace, revalidate, or remove my credential, so that I retain control when keys rotate or are revoked.
10. As a BYOK User, I want invalid or revoked credentials to produce an actionable access state, so that I can repair the connection without losing my work.
11. As a prospective subscriber, I want a public comparison of BYOK and Pro, so that the price and limits are transparent before Checkout.
12. As a prospective subscriber, I want Pro presented as $29 per month with no free trial, so that billing begins predictably.
13. As a subscriber, I want Stripe-hosted Checkout, so that payment details are handled by Stripe.
14. As a subscriber, I want a Customer Portal action, so that I can manage payment methods and cancellation without contacting support.
15. As a subscriber returning from Checkout, I want to see pending status until Stripe confirms access, so that a browser redirect cannot falsely grant Pro.
16. As a subscriber, I want Paid-Through Access to continue through a scheduled cancellation date, so that I receive the period I purchased.
17. As a subscriber with a delinquent, paused, canceled, fully refunded, or disputed subscription, I want Managed Inference disabled and BYOK used when available, so that access matches financial status.
18. As a Pro User, I want $10 of Managed Inference per paid billing period, so that the included value is clear.
19. As a Pro User, I want unused Managed Inference Allowance to expire rather than roll over, so that every period has a predictable limit.
20. As a Pro User, I want GLM 5.3 Flash to remain the default managed model, so that the current fast default remains available.
21. As a Pro User, I want a small Managed Model Catalog of reliable, tool-capable, cost-predictable models, so that included inference remains useful and sustainable.
22. As a BYOK User, I want access to the broader compatible OpenRouter catalog, so that I can choose models outside the managed catalog at my own cost.
23. As a User with both access paths, I want eligible models to use Managed Inference first, so that my Pro benefit works automatically.
24. As a User with both access paths, I want BYOK to take over when the managed allowance is exhausted or unavailable, so that work can continue.
25. As a User selecting a model outside the Managed Model Catalog, I want Launchstack to use BYOK directly, so that expensive or unpredictable models never consume platform funds.
26. As a User, I want all authenticated Workspace AI Activity—including main agents, subagents, titles, commit messages, pull-request content, and automated fixes—to use the same Credential Routing rules, so that there is no hidden model spending.
27. As a User, I want deterministic repository and sandbox operations excluded from inference accounting, so that token allowance reflects model usage only.
28. As a User in a multi-step run, I want an in-flight model response to finish when an allowance boundary is reached, so that streamed output is not corrupted.
29. As a User in a multi-step run, I want Credential Routing re-evaluated before the next model call, so that the run switches safely without replaying tools.
30. As a User without BYOK after exhausting managed inference, I want the run paused with completed effects preserved, so that I can add a key and resume safely.
31. As a User, I want exact inference cost and credential source recorded, so that allowance progress is trustworthy.
32. As a BYOK User, I want two Running Sandbox hours per UTC calendar month and one concurrent Running Sandbox, so that I have a meaningful bounded free path.
33. As a Pro User, I want twenty-five Running Sandbox hours per paid billing period and two concurrent Running Sandboxes, so that I can perform sustained work.
34. As a User upgrading mid-month, I want a fresh Pro Sandbox Allowance for the paid period, so that prior free usage does not reduce the purchased benefit.
35. As a User, I want inference and Sandbox Allowances tracked separately, so that exhausting one does not obscure the other.
36. As a User, I want inactive sandboxes to hibernate after fifteen minutes, so that saved work persists without silently burning allowance.
37. As a User, I want active workflows, commands, tools, terminals, files, previews, and explicit keep-alive activity to prevent premature hibernation, so that real work is not interrupted.
38. As a User, I want a warning before hibernation and automatic persistent resume when allowance remains, so that lifecycle behavior is understandable.
39. As a User at 75% allowance consumption, I want a passive warning, so that I can monitor usage early.
40. As a User at 90% allowance consumption, I want a prominent warning before new work, so that I can choose a lower-cost path.
41. As a User at 100% managed inference, I want the UI to explain BYOK fallback or adding a key, so that the next action is clear.
42. As a User at 100% sandbox time, I want new and resumed sandboxes blocked with the exact reset date, so that the limitation is predictable.
43. As a User, I want allowance notifications inside the product, so that v1 does not require a separate email-notification system.
44. As an administrator, I want Administrative Inference to use a separately limited internal credential, so that operations do not impersonate customer access or alter customer allowance metrics.
45. As a normal User, I want access rules independent of my email domain, so that `@vercel.com` does not become an undocumented entitlement.
46. As a platform operator, I want managed OpenRouter subkeys isolated and limited per User, so that one compromise or runaway workload cannot consume the platform account broadly.
47. As a platform operator, I want managed-key provisioning failures to fall back only to the User's BYOK credential, so that no unrestricted shared key is exposed as a hidden fallback.
48. As a platform operator, I want webhook events processed idempotently and safely out of order, so that duplicate delivery cannot corrupt entitlement state.
49. As a platform operator, I want subscription, allowance, credential, and sandbox events observable without logging secrets, so that production failures can be diagnosed safely.
50. As a future connector User, I want each chat to have a durable Execution Backend identity, so that Codex and OpenCode can be added without corrupting existing Launchstack Native history.

## Implementation Decisions

- The User is the ownership boundary for credentials, Pro Subscription state, Managed Inference Allowance, and Sandbox Allowance across all repositories, sessions, chats, main agents, and subagents.
- A central server-side access-policy module is the primary authorization seam. It decides whether Workspace AI Activity or sandbox provisioning/resume is allowed, selects the eligible Inference Source, returns structured remediation states, and never returns a secret to browser code.
- OpenRouter BYOK credentials use application-owned authenticated encryption with explicit key versioning. The persisted record separates ciphertext material from safe display metadata and validation timestamps. Plaintext is accepted only on create or replacement and is never returned.
- OpenRouter credential validation uses a non-inference authentication endpoint where possible. Validation and provider failures must be redacted from logs, analytics, workflow output, and HTTP errors.
- Launchstack Native model creation accepts an explicit server-resolved OpenRouter configuration. Authenticated calls may not implicitly fall back to a deployment-wide completion key.
- All authenticated Workspace AI Activity uses the same Credential Routing boundary, including helper generations outside the main chat workflow. Public marketing demonstrations, if retained, use separate tightly limited operational access.
- BYOK or Paid-Through Access is required before the first Launchstack Native run. The access check occurs before message persistence, durable workflow creation, and sandbox provisioning.
- A blocked first-send remains a Pending Prompt in client draft state with text and attachments intact. Restoring access never auto-submits it.
- Stripe Billing and Checkout Sessions implement the $29 monthly Pro Subscription. There is no trial, annual price, or metered overage in v1.
- Checkout uses dynamic payment methods and does not specify `payment_method_types`. Customer Portal handles self-service payment methods and cancellation.
- Verified Stripe webhooks are the only authority that grants or revokes Paid-Through Access. PostgreSQL persists the local customer, subscription, product, billing-period, status, and entitlement read model for fast authorization.
- Webhook receipt IDs are persisted for idempotency. Reconciliation tolerates duplicates and out-of-order subscription and entitlement events.
- `active` financial status grants managed access. Scheduled cancellation retains access through the paid period. Delinquent, paused, expired, canceled, fully refunded, and disputed states do not grant managed access. Partial refunds do not prorate allowance in v1 and require manual review.
- Pro maps to a managed-inference entitlement and a $10 Managed Inference Allowance bounded by the verified Stripe billing-period start and end. Allowance does not roll over.
- Each entitled User receives a distinct OpenRouter subkey created through an OpenRouter Management API key. The key has a $10 hard limit for the paid period and is rotated or reset from verified billing-period transitions rather than assuming OpenRouter's generic calendar reset matches Stripe.
- Managed-key material is encrypted. Safe key hash, label, lifecycle, provisioning error, and rotation metadata are stored separately. Managed-key revocation follows loss of entitlement.
- GLM 5.3 Flash remains the default Managed Model Catalog entry. The initial catalog contains three to five verified, reliable, tool-capable, cost-predictable models. Exact IDs are operational configuration so the catalog can change without database migration.
- Credential Routing is managed-first for catalog models, BYOK fallback when managed access is exhausted or unavailable, and BYOK-only for models outside the catalog.
- Managed allowance is checked before every model call. In-flight responses finish. A rejected managed call may be retried once through BYOK before any requested tools execute. Existing tool effects are never replayed automatically.
- Exact normalized provider cost and credential source are added to usage accounting. Local accounting drives the product read model; the isolated OpenRouter subkey remains the upstream hard-spend backstop for concurrent runs and reconciliation drift.
- A managed provisioning outage never falls back to an unrestricted shared platform completion key. It uses BYOK or returns a resumable access state.
- Sandbox usage is a separate wall-clock allowance because provisioned memory is billable during waits. BYOK receives two hours per UTC calendar month with one concurrent Running Sandbox. Pro receives twenty-five hours per paid billing period with two concurrent Running Sandboxes.
- Upgrade begins a fresh Pro Sandbox Period; prior free sandbox time does not reduce it. Hibernated or stopped persistent sandboxes do not consume Running Sandbox time.
- The default inactivity threshold changes from thirty to fifteen minutes. User activity, workflows, commands, tools, terminals, files, previews, and explicit keep-alive signals refresh activity. Resume rechecks allowance and concurrency.
- Allowance thresholds are 75% passive, 90% prominent before new work, and 100% actionable fallback or block. V1 notifications are in-product only.
- The public pricing surface presents BYOK at $0 with User-funded inference, two sandbox-hours, and one concurrent sandbox; Pro at $29 monthly with $10 managed inference, BYOK fallback, twenty-five sandbox-hours, and two concurrent sandboxes. It does not claim unlimited usage or unshipped connectors.
- Settings gains credential, Billing, subscription, allowance, reset-date, fallback, and Customer Portal states. Structured API errors drive access and upgrade actions.
- Email-domain-specific hosted-demo privileges and the five-message managed trial are removed. An explicit administrator may use separately limited Administrative Inference that is excluded from customer allowance metrics.
- The schema gains User-owned provider credentials, Stripe customer/subscription state, entitlement state, processed webhook receipts, managed-key lifecycle metadata, inference cost/source accounting, sandbox-period usage, and the minimal fixed Execution Backend identity for chats.
- Schema changes use generated Drizzle migrations. No `db:push` workflow is introduced.
- The minimal Execution Backend seam pins Launchstack Native to existing chats and supports future backend values without implementing live Codex/OpenCode behavior. Cross-backend continuation will use a Backend Fork in the future.
- Sensitive Stripe, encryption, and OpenRouter Management credentials live only in server-side sensitive environment configuration. Stripe uses a least-privilege restricted key where supported, distinct keys per environment, verified webhook signatures, and no secret values in source, logs, analytics, errors, browsers, or sandboxes.
- Stripe Tax remains disabled until the business has appropriate active registrations. Tax readiness is a release gate rather than an unverified code toggle.

## Testing Decisions

- Tests assert externally observable authorization, routing, lifecycle, billing, and UI behavior rather than private helper structure.
- The highest test seam is the central access-policy boundary: given a User's credential, entitlement, model, allowance, sandbox, and time state, it returns the permitted Inference Source or a structured remediation result.
- Authenticated credential route tests cover ownership, write-only responses, invalid and revoked keys, replacement, removal, and redacted failures.
- Security-focused unit tests cover encryption round trips, nonce uniqueness, authentication failure, wrong key/version behavior, and secret redaction because those invariants are not fully observable at an HTTP seam.
- Stripe route tests cover Checkout ownership and parameters, Portal ownership, raw-body signature verification, customer linkage, duplicate receipt idempotency, out-of-order transitions, financial statuses, refunds/disputes, and entitlement revocation.
- Workflow and helper-generation tests prove explicit credential propagation for main agents, subagents, and every authenticated model-powered helper. Tests reject client attempts to select managed-only access or bypass the Managed Model Catalog.
- Usage tests cover exact cost/source persistence, period boundaries, no rollover, concurrent admission near the limit, upstream subkey rejection, BYOK fallback, and Paused Run behavior without duplicated tool effects.
- Sandbox-policy tests cover free and Pro period calculations, upgrades, concurrency, wall-clock metering, fifteen-minute inactivity, active-work exclusions, hibernation, resume, exhaustion, and reset dates.
- UI/component tests cover Pending Prompt preservation, no auto-submit, credential management, pricing copy, Checkout pending state, Billing state, Customer Portal action, allowance warnings, fallback messaging, mobile layouts, keyboard behavior, and accessible status announcements.
- Existing route-test and database-test patterns are preferred. New seams are introduced only where the central access policy or provider boundaries do not exist today.
- Focused Bun tests run during each slice. Final verification runs generated-migration checks and `pnpm run ci`.
- Verification reports keep local code, static checks, migration generation/application, provider configuration, signed webhook delivery, preview deployment, real subscription lifecycle, and real renewal fulfillment as distinct gates.

## Out of Scope

- Live Codex, OpenCode, Claude Code, Cursor, or Grok execution adapters.
- Reusable Provider Connection credential custody and provider login UI.
- Cross-backend Backend Fork implementation beyond the minimal schema/interface seam.
- Annual Pro pricing, free trials, seat-based or organization billing, metered overages, compute add-ons, allowance rollover, and partial-refund proration.
- Email allowance notifications.
- Automatically enabling or configuring Stripe Tax before registrations exist.
- A User-funded Vercel or CodeSandbox connection that transfers sandbox billing to the User.
- Claims of unlimited inference, unlimited compute, or future connector availability.

## Further Notes

- The current default model `z-ai/glm-5.3-flash` must remain available and remain the default managed model.
- OpenRouter and Stripe credentials required for live provider proof will be supplied separately and must never be committed.
- The repository contains unrelated landing-page edits in the original checkout. Implementation must occur in an isolated `codex/` worktree and preserve those changes.
- The domain glossary and ADRs are binding context for implementation. In particular, signed webhooks authorize paid access, User inference credentials remain isolated, and Execution Backends are pinned to chats.
- Live Codex/OpenCode support will follow a T3 Code-style provider driver/adapter architecture in a later project, after validating current provider terms and supported credential persistence.
