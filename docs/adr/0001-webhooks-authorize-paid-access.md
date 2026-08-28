# Signed webhooks authorize paid access

PostgreSQL stores the application's subscription and entitlement read model, but only verified Stripe webhook transitions may grant or revoke Paid-Through Access. Checkout redirects and browser state are acknowledgements, not financial authority, because subscription state can change without an active browser and redirects can arrive before payment state is durable.
