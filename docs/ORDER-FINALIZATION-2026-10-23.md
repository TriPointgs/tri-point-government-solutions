# Marketplace: immutable test-order finalization — October 23, 2026

## Scope and starting point

Continuation of draft PR 23 on feature/td-product-controls, starting from 266296875249bb4112e1e5989bd1228f744e83a0. Existing merchant Stripe sandbox test remains separate. Wasabi, production, approved design/logo, contractor workflows and TD purchase-order permissions are unchanged.

## Implemented

- The existing shop service now supplies a server-only, provenance-checked finalization snapshot. It rereads the owner-scoped saved review, verifies cart/product/pricing revisions, rechecks current TD identity/stock/prices/freight and margin controls, and rejects changed prices rather than accepting a silent amount increase. Full-catalog records without the necessary saved reviews do not become sellable automatically.
- A private immutable order record links a saved review to one stable test-order ID per merchant and browser owner. Conditional writes, active claims and read-back recovery protect parallel/replayed requests and uncertain storage responses. Failed checks never produce an awaiting-payment order.
- The finalizer requires separate acceptance of current purchase terms and a versioned, private approved merchant policy. The old checkout-review consent is not treated as purchase acceptance. Tax codes must match exact SKU and manufacturer part. Government exemption is not guessed.
- Stripe Tax results are now provenance-branded only after the configured adapter validates the merchant and processor response. The finalizer checks the exact request digest, amount, shipping, address, account, currency and freshness. A JSON copy, standalone parser result, wrong-order proof or unknown tax amount cannot satisfy the finalizer.
- Saved payable test orders match the existing Stripe Checkout bridge and captured-payment verifier. The public projection omits buyer contact/address, source costs, private policy evidence and tax-provider identifiers. Buyer details stay in private storage.

## Shipping boundary

TD freight in the current cart is a ZIP-based estimate, not a guaranteed full-address supplier charge. The finalizer therefore requires explicit approval of a merchant-fixed customer-shipping policy based on that verified estimate. No such approval was created. The stored record explicitly says supplierFreightGuaranteed=false. This is an available future policy strategy, not a statement that Tri-Point has adopted it or that all orders qualify for free freight.

## Activation boundaries

The new service is server-only and has no browser endpoint or admin approval override. TP_TEST_ORDER_FINALIZATION_ENABLED was not added or enabled. The merchant policy reader returns no approvals when no policy exists; it never invents defaults. Commercial Checkout, Stripe Tax approval/activation and TD purchasing remain disabled. Production mode always rejects these test components.

The private policy would be stored outside Git under the account-scoped preview/final-orders/v1 namespace. Actual policy evidence, buyer data, addresses, tax documents and credentials must never be committed to this public repository. Tests use synthetic records and mocked provider responses only.

## Verification

27 added tests cover normal finalization, one order per review, races, replay, wrong-owner access, changed prices/freight, stock and margin holds, policy changes/expiry, exact product tax codes, forged/wrong-order tax proof, storage uncertainty, private data projection and production denial. One integration test exercises the real internal code chain: existing cart/review -> supplier mock recheck -> authenticated-adapter tax mock -> immutable order -> Checkout Session mock -> existing captured-payment gate. No real Stripe request, charge, TD order or email was made by these tests.

Complete build counts and deployed commit/ID are recorded in the continuation checkpoint after verification. A passing synthetic test is not proof of an actual Stripe-hosted payment, actual tax registration, or supplier fulfillment.

## Remaining launch work

1. Observe the already-deployed merchant-only $20 Stripe sandbox test from a signed-in browser, including real sandbox capture and webhook/return behavior.
2. Review actual commercial purchase/return/warranty/cancellation/shipping terms, tax registrations, exact item tax codes and exemption process. Do not activate a gate merely to remove an error.
3. Connect shopper acceptance, finalized orders and hosted Checkout through authenticated owner-scoped routes; handle late payments versus quote expiry, abandoned sessions, refunds and completion-event reconciliation.
4. Implement and test TD PO idempotency, supplier acceptance/uncertain-response recovery, customer order access, transactional email and tracking, reliable catalog hosting and final release reconciliation against newer main.

No production release or Wasabi implementation is authorized by this milestone.
