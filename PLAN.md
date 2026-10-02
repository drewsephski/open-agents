# Launchstack Pro billing

Pro costs $29 USD per month and includes $10 of managed OpenRouter inference, 25 running sandbox hours, and two concurrent sandboxes per paid period. BYOK remains available with separately funded inference, two sandbox hours per UTC calendar month, and one concurrent sandbox. See `apps/web/lib/store-details.ts` and `apps/web/lib/access/allowance-period.ts`.

Creem is the merchant of record. Its live SaaS product uses tax-exclusive pricing; Creem calculates applicable checkout taxes. Launchstack does not collect card data. Checkout and customer portal use the official `@creem_io/nextjs` adapter behind authenticated, same-origin POST routes. All identity, product, quantity, success URL, and request IDs are derived on the server.

Signed webhooks retrieve authoritative subscription state through the Creem SDK. A paid event for the current billing period is required to enable allowances. Checkout completion, trials, redirects, and active status alone do not grant paid access. Receipts, checkout requests, financial state, and key lifecycle claims are durable and idempotent. Cancellation scheduled for period end preserves paid access. Refunds, disputes, delinquency, cancellation, and expiry reconcile access without granting a fresh allowance.

Each paid period receives an isolated encrypted OpenRouter key capped at $10 total, without a calendar-month reset, and expiring at the period end. Renewal rotates the key. Inference reservations and sandbox leases enforce concurrent usage server-side. Provider keys remain outside coding sandboxes and browser responses.

See `docs/creem-billing.md` for configuration, release gates, operational recovery, and validation evidence.
