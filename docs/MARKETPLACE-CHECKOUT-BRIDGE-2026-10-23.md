# Marketplace Checkout bridge and Tax adapter — October 23, 2026

Recovered from the prior saved development snapshot, based on 8062a3f972328bd5e897161f60a914f3b204329a. The modules are now included with the separate merchant sandbox-test milestone. This document supersedes the earlier uncommitted progress note.

## Server-only commercial Checkout foundation

lib/stripe-checkout-session.mjs requires a trusted server-owned finalized payable order, not a cart review or browser-paid flag. Existing policy validates exact products, quantities, prices, shipping, tax evidence, purchase terms and a current supplier quote. Hosted Stripe line items and PaymentIntent metadata are generated from that order. Account identity, returned amount, currency, test mode, metadata and Stripe URL are checked. Private records and a stable idempotency key support retry recovery.

The installed Stripe SDK 23.0.0 targets API 2026-09-30.endive. The session request now uses ui_mode=hosted_page and allowed_payment_method_types=['card']. The earlier hosted value was not the installed API's current enum.

reconcilePaid retrieves the actual Session, matches the saved order, binds its PaymentIntent to the existing verifier and rechecks full captured payment. A return-page URL is never proof of capture. Real supplier dispatch always remains false.

This bridge has no customer-facing HTTP route. TP_STRIPE_TEST_CHECKOUT_ENABLED remains disabled unless separately authorized. It still needs a finalized customer-order lifecycle, accepted commercial policies, approved taxes, quote-expiry/late-payment handling, durable completion-event linkage, refunds and fulfillment. Stripe's hosted session lifetime and the supplier quote lifetime must be reconciled before customer release; a late paid session does not bypass the expired-quote hold.

## Tax calculation foundation

lib/stripe-tax-quote.mjs requires approved business tax setup, a verified sandbox account, full US delivery address and approved tax code for every item. It calculates from server-owned line and shipping amounts, validates the returned address, total, currency and expiry, and produces hashed evidence. Unknown tax is not converted to zero. Government status does not automatically establish exemption.

TP_STRIPE_TAX_SETUP_APPROVED and TP_STRIPE_TEST_TAX_ENABLED remain off pending business review. The adapter does not establish registrations, approve certificates, file returns or activate live collection.

## Evidence and boundaries

Twenty Checkout bridge tests and ten Tax tests cover the recovered components. Fixtures are synthetic; they do not establish actual tax-account setup or real hosted Checkout success. Production mode rejects both components. No original logo, marketplace design, TD purchasing capability or Wasabi page was changed by these modules.

The separately routed fixed-$20 sandbox handoff is documented in STRIPE-SANDBOX-CHECKOUT-2026-10-23.md. It deliberately avoids fabricating commercial tax/terms approvals just to test Stripe.

Official references: https://docs.stripe.com/api/checkout/sessions/create ; https://docs.stripe.com/api/tax/calculations/create ; https://docs.stripe.com/testing
