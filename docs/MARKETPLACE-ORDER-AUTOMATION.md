# Tri-Point marketplace automation — staged implementation

## User-approved scope and pricing
- Destination is a public business purchasing marketplace. The existing administrator catalog is only the development-stage source.
- Default product markup is 15% (1500 basis points) above VERIFIED distributor product cost, not a 15% gross margin.
- Precedence: TD distributor SKU > manufacturer part > manufacturer > category > default. Overrides replace rather than stack.
- Customers see Tri-Point selling prices. Distributor costs, tokens, procurement strategy and vendor reference data remain private.
- Automatically fulfill only verified low-risk eligible orders; exceptions and high-value orders require staff review.

## Phase 1: pricing engine (this proposed change)
- Pure implementation: lib/marketplace-pricing.mjs
- Automated tests: tests/marketplace-pricing.test.mjs
- Money in integer USD cents. Default 15% markup, normalized overrides, half-up cent rounding and optional minimum gross profit hold.
- Rejects unverified or historical catalog fields, sandbox/test pricing, expired data, non-active or unauthorized items, malformed rules and unsupported currency.
- Accepts server-validated production price evidence ONLY. A boolean supplied by an end user must never be trusted. Implement a trusted authenticated TD price adapter in a later stage.
- This module is PRIVATE SERVER LOGIC only. Its result includes acquisition costs and MUST NOT be exposed as-is to browser or customer API responses.
- Quoted price excludes delivery, payment processing, sales tax and other expenses. Separate checkout validations and margin guards are required.
- This stage creates NO public product listing, live price endpoint, cart, order, transaction, email, scheduled check or distributor PO.

## Later phases: planned implementation, not yet delivered
1. Product publication: only resale-authorized SKUs; independent public item/title/image/specification store, no raw supplier feed exposure.
2. Checkout: revalidate production partner-specific price, stock, customer eligibility and order minimum; estimate freight; calculate taxes; hold price exceptions.
3. Payment and order ledger: secure hosted PCI-compliant provider, durable order IDs, idempotent events, payment and supplier state machines. No card details in site storage.
4. TD distributor fulfillment: map approved orders to SubmitPO once and persist acknowledgment; after uncertain/time-out response reconcile by unique PO before retrying; manual review on mismatch.
5. Distributor status: poll GetPOStatus and GetOrderStatus with rate limits; correlate line-level partial shipments and package tracking; deduplicate updates.
6. Customer notifications: transactional outbox for payment receipts, order acknowledgment, processing, shipped/partial, delays, delivery and returns/refunds. Retry failures with event-level idempotency.
7. Invoice reconciliation: match TD GetInvoice and GetInvoiceList with captured payments, fees, taxes, freight and credits.
8. Refunds/returns/exception handling: internal dashboard with documented approval and audit trail. TD cancellation/returns workflow not yet verified.
9. Production pilot and launch: separately validate production TD credentials, customer scope, payment processor, risk limits, permissions, product licensing and a controlled real order. Explicit user authorization before enabling external purchase, money movement or automatic fulfillment.

## Current evidence and boundaries
- Owner confirmed US UAT OAuth plus an Active GetPriceAvailability item for TD account 822539. This does NOT prove production API access, live retail prices, or SubmitPO authorization.
- TD API documentation includes GetAvailability, GetFreightQuote, SubmitPO, GetPOStatus, GetOrderStatus, GetPOList, GetInvoice, GetInvoiceList and GetQuote. These have not been tested in this integration.
- Existing Node 24 + Vercel site has admin-only catalog at /api/catalog, private local SQLite gateway, and other unrelated workflows. Keep these untouched.
- Gateway fix is a separate draft PR #20; do not implicitly merge or deploy.
