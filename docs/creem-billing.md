# Creem billing operations

## Live configuration

- Store: `launchstackpro`, display name Launchstack, website https://launchstack.sh.
- Product: `prod_4pQMP708PVhxNpTA3PkbA3`, recurring $29 USD each month, no trial, SaaS, tax exclusive.
- Webhook: `wh_35K0ij10Kofu4DBopMbgEn`, https://launchstack.sh/api/billing/webhook.
- Support: drewsepeczi@gmail.com. Full refunds may be requested within seven days of initial payment or renewal. Public policies live at /terms, /privacy, /acceptable-use, /refunds and /support.

Server configuration: `CREEM_API_KEY`, `CREEM_MODE=live`, `CREEM_PRO_PRODUCT_ID`, `CREEM_WEBHOOK_SECRET`, `OPENROUTER_MANAGEMENT_API_KEY`, base64 256-bit `ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION=1`, and `LAUNCHSTACK_APP_ORIGIN=https://launchstack.sh`. Checkout validates all billing prerequisites, including the encryption keyring. The obsolete `PRO_CHECKOUT_ENABLED` flag has no effect. The CLI remains live and does not persist newly supplied environment keys. Never print provider credentials or commit local environment files.

## Launch gates

The application exposes Pro checkout once its billing configuration is complete; Creem controls live account approval. Configure a test environment with a `creem_test_` key, `CREEM_MODE=test`, the test product and webhook secret, and a separate database for simulated paid events. Do not inject synthetic paid subscriptions into production. A live checkout created without a payment proves checkout rendering only, not payment, renewal, portal ownership, or refund processing. The owner must complete any real live purchase or provide test credentials for full payment lifecycle proof. Identity verification and new provider legal acceptance remain owner actions.

Before accepting live payments, verify signed payment delivery, the linked authenticated customer, paid-period inference key provisioning, sandbox admission, portal cancellation at period end, renewal rotation, and refund revocation. The billing return page checks the saved checkout through `/api/billing/sync`, then refreshes the access summary for up to one minute and offers a manual recheck afterward. Recovery retrieves the checkout and its transaction using the server's Creem key, verifies the saved request, product, customer and authenticated owner, and binds payment proof to the transaction's exact billing period. A return URL, checkout completion, or active status alone never grants paid access.

Customer copy describes included AI usage rather than a dollar credit. The internal hard spending cap remains unchanged, and billing displays percentage usage. Model and task choices affect consumption; unused allowances do not roll over.

## Recovery

Webhook failures return non-2xx for Creem retry. Inspect `billing_webhook_receipts.processing_state` and `processing_error_code`; retry the original event after resolving provider configuration. Leased claims prevent stale workers from publishing state. Replaying a successful event is a no-op. A completed checkout or an active subscription alone cannot create paid access. Never update entitlement rows manually as a substitute for a verified payment. Return-page recovery uses the same subscription, financial-state and managed-key reconciliation as webhooks; it preserves newer financial events and cannot restore a refunded or disputed period.

Local test checkouts need a running Creem CLI listener because Creem cannot deliver HTTP webhooks to localhost. Reuse the CLI-mode test endpoint whose signing secret matches `CREEM_WEBHOOK_SECRET`, with `creem listen --environment test --webhook <test-webhook-id> --forward-to http://localhost:<port>/api/billing/webhook`. Supply the test API key through the process environment without changing the CLI's saved live key. Pending signed events can be replayed and acknowledged through that endpoint. The return-page recovery also works when the local listener is stopped; renewal, refund and cancellation delivery still require the listener.

Managed keys have a hard paid-period expiry. Unattached keys have durable cleanup jobs; retries perform cleanup before later lifecycle work. Check `managed_inference_keys` and `managed_key_cleanup_jobs` if provisioning or disable operations fail. Do not delete an encryption key while credentials still reference its version. Add `ENCRYPTION_KEY_V<n>` for old decrypt versions when rotating the active key.

## Verification

Run `pnpm run ci`, `pnpm --dir apps/web db:check`, and `git diff --check`. Real SQL tests cover concurrent claims, stale workers, paid-period rollover, and refund replay. Raw-body signature tests exercise the official adapter and failure responses. Provider configuration, checkout rendering, deployment, and actual payment lifecycle are separate evidence.

## Observed provider gates (October 2, 2026)

The live API creates and retrieves a pending checkout through the actual Next.js adapter, but the hosted page says **Live payments are not enabled for your account / Account Verification Required**. The live management key successfully created a $10 total-cap expiring key and disabled it afterward, without an inference call. No real purchase was made, and payment lifecycle fulfillment remains unverified until account activation. Store re-review was submitted and shown Under Review.
