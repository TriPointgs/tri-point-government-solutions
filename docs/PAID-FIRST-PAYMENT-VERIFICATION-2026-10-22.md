# Captured payment before supplier submission — October 22, 2026

Project: Different Solicitations / Tri-Point Government Solutions LLC marketplace. Existing draft PR 23, feature/td-product-controls. Baseline: 06b64c4d25cdc6d4e69f92c53a8331013c9ac3a2.

## Owner requirement and interpretation

The owner asked whether the customer is confirmed paid before TD receives an order, then directed continued implementation. This milestone uses the stricter rule: **full captured processor payment verified server-side before any supplier submission**, not authorization alone. The approved storefront design, original logo, 15% markup/overrides and manufacturer restrictions stay fixed.

Captured payment is not a completed payout into Tri-Point's bank account and is not immunity from later refunds, reversals or disputes. This implementation makes no bank-cleared-funds claim. It does not open public checkout, connect a payment account, capture real funds or send a TD purchase order.

## Found and corrected existing workflow

The previous simulation permitted authorization → sourcing review → supplier submission/acceptance → capture. That was incompatible with captured-before-TD. The active simulation is now:

1. Synthetic authorization and approved sourcing/risk review.
2. Full synthetic capture, matching the immutable order total.
3. Simulated supplier submission with a single stable PO reference.
4. Supplier acceptance or explicit reconciliation after an uncertain response.
5. Shipment and delivery demonstration.

Authorization-only and partial captured amounts cannot submit. A supplier rejection after capture, or a hold before submission, requires refund review; it does not claim money was refunded. A separate synthetic full-refund confirmation is available. Old simulations without the new policy identifier are held and must be restarted, not silently advanced using a different payment sequence.

## Test-only server payment verification foundation

An optional Stripe adapter is prepared because Stripe documentation provides the concrete PaymentIntent/Charge semantics for this implementation. **This is not a decision to enroll Tri-Point in Stripe or a claim that an account has been connected.** No payment-related Vercel keys were found in the inspected non-decrypting metadata on this date. No account or credential changes were made.

The Stripe SDK is pinned at 23.0.0 (reported API version 2026-09-30.endive). The adapter only authenticates read requests and validates event signatures; it has no create-session, create-payment, capture, refund or TD submission method. It is disabled unless explicit test configuration is present and rejects production runtime/live keys/live events.

Prepared configuration names (do not enter secrets in chat or source):
- TP_STRIPE_TEST_READS_ENABLED=true
- TP_STRIPE_TEST_SECRET_KEY — test or restricted-test key only
- TP_STRIPE_TEST_ACCOUNT_ID — merchant account explicitly pinned to the intended Tri-Point account
- TP_STRIPE_TEST_WEBHOOK_SECRET — endpoint-specific signing secret

No flag was enabled, no destination registered and no authenticated external Stripe request made in this milestone. The account must be verified as Tri-Point-owned before enabling a sandbox integration. Adding these keys alone would still not create checkout sessions or supplier orders.

### Binding before trusting a payment

A server-only hook accepts a finalized **test payable order**, not a private checkout review. It validates lines and integer quantities, line prices, subtotal, final shipping, known calculated/exemption-reviewed tax, tax evidence, address commitment, purchase-terms version, unresolved holds and current quote expiry. Unknown tax cannot be treated as zero. It hashes the immutable order/quote and binds that digest, order/version, amount/currency, merchant account and PaymentIntent.

Bindings are bidirectional and immutable: one PaymentIntent cannot pay two orders, and one order cannot silently accept a second PaymentIntent. Conditional creation makes partial failures recoverable by retrying the same binding; conflicting attempts require reconciliation. No browser/admin HTTP endpoint exposes this registration hook. Existing checkout reviews remain non-payable and are not automatically converted.

### Signed event and authoritative re-read

/api/payment-events uses Vercel's Web Standard fetch handler so it can read the original bounded body stream without a lazy JSON body parser changing signature bytes. The official Stripe SDK verifies its signature, with a 300-second replay window and a small future-clock tolerance. Unsupported events are ignored; live-mode/Connect contexts are rejected in this single-account test adapter.

A valid event only points to an already-bound payment. It does not create an order or prove payment by itself. The adapter re-reads the authenticated merchant account and PaymentIntent with its latest Charge/refund data. It checks:
- exact merchant account, intent/charge linkage, order/version and quote metadata;
- exact USD total and fully received/captured amount;
- PaymentIntent succeeded, no amount remaining capturable, and a captured/paid successful charge;
- no refunds, pending/unknown refund history, dispute, fraud-review or unsupported account routing;
- initially supported card payment method only.

Authorization, processing, incomplete/declined/cancelled payment, partial capture, amount/currency mismatch and uncertain data cannot pass. A successful PaymentIntent with a refunded/disputed Charge is blocked. Only a proof object created by the authenticated reader is accepted by the gate; a cloned/raw JSON paid flag cannot substitute.

### Durable observations and replay/race control

Private test records are stored under preview/captured-payment-tests/v1 with digest paths and explicit origin/ETag reads/writes. No raw webhook, credentials, card details, receipt URL or customer contact/address is persisted here. A versioned verification claim clears prior approval before checking; concurrent callbacks cannot overwrite each other. Duplicate event delivery returns the stored outcome without repeating provider reads. A newly observed refund/dispute invalidates a concurrent older success and persists a review hold. Older success notifications cannot clear that hold.

Lost completion acknowledgements are recovered using the saved completion token. Provider/storage uncertainty stays blocked and retryable; it is not acknowledged as paid. The reusable test payment observation is valid briefly and must be re-read immediately before any future dispatch. The stored payment observation is not itself a dispatch permission.

**Every result in this release has realSupplierDispatchAllowed=false.** Even a verified test capture cannot reach a real supplier order. The TD adapter remains read-only. Production dispatch needs a separate reviewed implementation, fresh sourcing/tax/profit checks, a durable one-time PO claim, outcome reconciliation, approved refund processing and a controlled live pilot.

## Merchant visibility

The existing Launch Center now states the captured-first policy and test-connector configuration separately from launch readiness. It links to the existing order simulation so the owner can exercise authorization, capture, supplier rejection, reconciliation and refund boundaries. No redesign, new customer worksheet or fake paid status was added to the storefront.

## Verification

- 38 new focused payment tests plus the updated existing order-domain tests. Final full build totals are recorded in the deployment receipt.
- Test cases include raw-body signature validation, stale/future/altered signatures, test/live/account separation, full capture/amount/currency, metadata binding, adverse events, old-success delivery, callback races, lost acknowledgement recovery, bidirectional intent/order uniqueness, private storage and disabled production endpoints.
- Eleven isolated Playwright checks cover the new visible sequence, blocked authorization-only submission, capture then supplier action, uncertain-outcome reconciliation, captured-order rejection/refund review, paid-order holds, responsive controls and unchanged storefront/logo/images.
- Browser and payment tests used local synthetic data and injected provider responses. They made no real payment-provider/TD request, payment, refund, supplier purchase or email send. Real sandbox transactions, webhook delivery through a hosted destination and live Blob persistence are still unverified.
- One bounded independent reviewer questioned timestamp units. The pinned Stripe SDK implementation divides receivedAt by 1000; milliseconds are correct. The stale-signature tests passed, and explicit lower/upper timestamp checks were added. The incorrect recommendation to pass seconds was not applied. No model-tier claim or recursive delegation is made.
- The first browser run hit case-sensitive test assertions against CSS-capitalized status labels. Assertions were corrected to match visible casing; workflow and production behavior were not weakened. All eleven browser checks then passed.
- Production-mode build checks and original-logo byte comparisons are performed before commit. No main merge, production deployment, paid service, new account, credential write or scheduled job is part of this release.

## Remaining work

1. Select/verify the Tri-Point processor account and its sandbox, then implement actual hosted checkout/session creation around finalized server-owned order/tax/policy inputs. Do not use unrelated-business credentials.
2. Connect the test-only verifier to sandbox-created orders and verify provider callbacks and failure recovery end to end. Verify account ownership and webhook routing; Vercel deployment protection must not be bypassed globally to receive events.
3. Build the actual payment capture/refund and supplier dispatch/reconciliation workflow. Captured funds must remain a mandatory precondition; authorization-first supplier submission is superseded.
4. Add actual customer order access and transactional email dispatch after provider/order evidence is bound. Retain the noindex/public-release gates until the commercial integrations, policies, catalog infrastructure and live pilot are approved.

## Official references reviewed

- https://docs.stripe.com/payments/payment-intents/verifying-status
- https://docs.stripe.com/api/charges/object
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/events/manage-webhook-endpoints
- https://docs.stripe.com/payouts
- https://vercel.com/docs/functions/runtimes/node-js

These sources support payment-state/signature/payout/runtime mechanics, not a claim of a configured Tri-Point account or completed transaction.
