# Private Stripe Checkout handoff — October 23, 2026

Project: Different Solicitations / Tri-Point marketplace. Existing draft PR 23, branch feature/td-product-controls. Parent: 8062a3f972328bd5e897161f60a914f3b204329a.

## New milestone

/admin/stripe-checkout is a merchant-only page that creates one fixed $20.00 USD synthetic Stripe sandbox session after explicit consent, redirects to the genuine Stripe-hosted payment form and rechecks the result server-side on return. It does not use the customer's shopping cart, create a payable commercial order, invent a tax exemption, order a product or email a customer.

The existing sandbox account/key and signed webhook are reused. TP_STRIPE_SANDBOX_CHECKOUT_ENABLED controls only this isolated test and must be scoped to Preview and feature/td-product-controls. Production always rejects it. The separate commercial Checkout and Tax flags remain disabled. No existing credential values need to be revealed or replaced.

## Integrity and privacy

The server fixes the amount and description. The browser cannot provide price, tax, shipping, card method, provider URL or payment status. Only card payments are allowed. Sessions contain a unique test ID and exact metadata; the resulting PaymentIntent is checked through the existing branded verifier for account, mode, full captured amount, currency, charge linkage and refund/dispute indicators.

The test owner's signed HttpOnly Secure SameSite=Lax cookie is distinct from the administrator session and commercial cart cookie. Record ownership is checked on every browser access. Existing staff authentication remains required, and all endpoints are noindex/no-store. Stripe receives card details directly; no card-entry fields are added to Tri-Point.

The private Blob namespace is preview/stripe-sandbox-demo/v1. Actual origin ETags protect updates. Stable request IDs and Stripe idempotency prevent a lost response or double click from silently creating new sessions. Records in an uncertain creation state must be retried with the same ID. Late creation retries are held. A new test is deliberate and does not cancel an older test.

PaymentIntent metadata routes signed demo events to the isolated test ledger. The commercial payment ledger is never populated by these tests. Replayed signed events do not duplicate verification. An observed adverse event creates a sticky hold; current refunds/disputes also fail the independent provider read. A browser redirect, query parameter or previous success cannot substitute for current processor evidence.

The UI preserves the resume link for an unpaid session, marks old observations as historical, and clears its success label when a current verification fails. A captured sandbox test always reports commercialOrderCreated=false and realSupplierDispatchAllowed=false.

## Verification

The complete test count is recorded in the release checkpoint after final builds. New coverage includes 28 sandbox service/API tests, the recovered 20 Checkout bridge tests and 10 Tax tests. Fourteen synthetic browser workflows passed: sign-in return target; explicit test consent; redirect; cancel/resume; idempotent reuse; verified capture; redacted responses; three screen widths; failed-read handling; browser ownership; cross-site and price-tampering rejection; existing Launch Center/storefront; sign-out denial; and no client script errors or external provider traffic.

Chromium initially lacked libraries/fonts in the isolated test VM. Those dependencies were installed only there; no site dependency was added. Browser tests then exposed an unpaid resume-link issue and stale success wording after a failed recheck. Both were corrected and the entire browser flow rerun successfully. The browser's Stripe page and processor replies were injected fixtures, not the real Stripe service.

Original logo files remain byte-identical to the parent commit. No Wasabi assets, contractor data, production configurations, real cards, TD POs or mail deliveries were changed or used by these tests. No background workers, scheduled monitoring or additional delegated agents were created.

## First hosted validation

After the exact preview deployment is confirmed READY, sign in at the stable branch URL /admin/stripe-checkout. Confirm the sandbox notice, open Stripe and use test card 4242 4242 4242 4242 with a future expiry and test CVC. On return, the result should say Sandbox capture verified. A failure is an unverified connection, not a paid product order. Retain only the status/error message; do not share keys, full session URLs or payment client secrets.

This first real hosted sandbox request has not been demonstrated by local fixtures. Production launch remains blocked on full cart-to-order integration, approved tax/policies, TD submission/reconciliation, transactional notifications, customer order access, dependable catalog hosting and an approved end-to-end pilot. Wasabi remains a separately authorized future phase.
