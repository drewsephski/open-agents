# Creem billing operations

## Live configuration

- Store: `launchstackpro`, display name Launchstack, website https://launchstack.sh.
- Product: `prod_4pQMP708PVhxNpTA3PkbA3`, recurring $29 USD each month, no trial, SaaS, tax exclusive.
- Webhook: `wh_35K0ij10Kofu4DBopMbgEn`, https://launchstack.sh/api/billing/webhook.
- Support: drewsepeczi@gmail.com. Full refunds may be requested within seven days of initial payment or renewal. Public policies live at /terms, /privacy, /acceptable-use, /refunds and /support.

Server configuration: `CREEM_API_KEY`, `CREEM_MODE=live`, `CREEM_PRO_PRODUCT_ID`, `CREEM_WEBHOOK_SECRET`, `OPENROUTER_MANAGEMENT_API_KEY`, base64 256-bit `ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION=1`, `LAUNCHSTACK_APP_ORIGIN=https://launchstack.sh`, and `PRO_CHECKOUT_ENABLED`. The CLI remains live and does not persist newly supplied environment keys. Never print provider credentials or commit local environment files.

## Launch gates

`PRO_CHECKOUT_ENABLED=false` keeps purchases closed while Creem reviews the store and until a real customer-owned purchase proves fulfillment. Configure a test environment with isolated test credentials and a separate database for simulated paid events. Do not inject synthetic paid subscriptions into production. A live checkout created without a payment proves checkout rendering only, not payment, renewal, portal ownership, or refund processing. The owner must complete any real live purchase or provide test credentials for full payment lifecycle proof. Identity verification and new provider legal acceptance remain owner actions.

After store approval, verify signed payment delivery, the linked authenticated customer, paid-period inference key provisioning, sandbox admission, portal cancellation at period end, renewal rotation, and refund revocation. Only then enable general sales and update public pricing availability consistently.

## Recovery

Webhook failures return non-2xx for Creem retry. Inspect `billing_webhook_receipts.processing_state` and `processing_error_code`; retry the original event after resolving provider configuration. Leased claims prevent stale workers from publishing state. Replaying a successful event is a no-op. A completed checkout or an active subscription alone cannot create paid access. Never update entitlement rows manually as a substitute for a verified payment.

Managed keys have a hard paid-period expiry. Unattached keys have durable cleanup jobs; retries perform cleanup before later lifecycle work. Check `managed_inference_keys` and `managed_key_cleanup_jobs` if provisioning or disable operations fail. Do not delete an encryption key while credentials still reference its version. Add `ENCRYPTION_KEY_V<n>` for old decrypt versions when rotating the active key.

## Verification

Run `pnpm run ci`, `pnpm --dir apps/web db:check`, and `git diff --check`. Real SQL tests cover concurrent claims, stale workers, paid-period rollover, and refund replay. Raw-body signature tests exercise the official adapter and failure responses. Provider configuration, checkout rendering, deployment, and actual payment lifecycle are separate evidence.
