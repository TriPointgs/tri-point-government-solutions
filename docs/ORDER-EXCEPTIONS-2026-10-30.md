# Order-stop and full test-refund safeguards — October 30, 2026

## Scope
Continue the marketplace at `da93654aba6855c6b637f4158e51882d7469b4c7` on `feature/td-product-controls`, draft PR 23. The successful TD OAuth/product read remains the latest external supplier milestone; no unchanged authentication retry is needed. Main was observed at `574c00af9004cbf3023ef8cb7f59363af758df7c` and is not modified or released by this patch.

Two related features are implemented: a permanent administrator stop before supplier release, and a separately gated full Stripe TEST refund with durable single-attempt recovery. The private workspace is `/admin/order-exceptions`, linked from Order operations and the fulfillment pilot. It reuses the existing shop function; there is no new serverless function, cron or public customer mutation route.

## Permanent pre-submission stop
The stop uses the exact same conditional supplier-dispatch record as preparation and submission. A stop that wins the version check invalidates an in-flight preflight operation; a submission that has already durably claimed its send intent prevents the stop from claiming success. Attempted/uncertain/accepted supplier orders require separate reconciliation and cancellation review. There is no reset or resume operation.

The stop remains effective even if the UAT credential scope changes later, provided the immutable order/destination seal still matches and no supplier attempt exists. Other scope mismatches still fail closed. This permits credential rotation without silently losing a permanent stop.

New/resumed application checkout is blocked for a stopped order, including a final check immediately before Stripe Session creation. Buyer payment availability and fulfillment reflect the hold; old supplier tracking is not attached. Existing captured payments can still be verified. A stop is not a refund, a supplier cancellation, or a reversal of an already-created/in-flight Stripe Session. The merchant can separately use the existing unpaid-Session expiry operation. An already-open Session could still be paid until it is actually expired; the supplier stop remains in place.

## Exact full TEST refund
Three independent runtime settings are required to create a refund: `TP_STRIPE_TEST_REFUND_ENABLED=true`, `TP_STRIPE_TEST_REFUND_APPROVED=true`, and `TP_STRIPE_TEST_REFUND_ORDER_ID` matching the exact saved test order. This implementation does not set or approve those values. Production and non-test credentials are rejected.

The browser submits only the order UUID, expected revision, request UUID and explicit consent. It cannot supply an amount, PaymentIntent, account, recipient or refund-success flag. The service reads both original payment-link and ledger records, validates the immutable finalized order and historic quote digest, and rechecks the captured test payment and charge with Stripe. A stale supplier quote does not prevent refunding the original captured payment. Prior refunds, disputes, authorization-only payments, live-mode objects and mismatched identity/amount are rejected before creation.

A permanent release stop with no supplier attempt is mandatory. The refund intent is saved and read back before a single provider POST. A stable idempotency key is additional protection, not permission to resend after its provider retention window. After any attempted request, only read-only reconciliation is allowed; a new request UUID cannot create a second attempt. Uncertain storage writes prevent provider creation. Lost provider replies are resolved by exact payment-filtered refund listing and canonical refund retrieval, never by another create.

The complete returned refund set must identify exactly one matching full refund with the expected order/request metadata, charge, currency and time. Pending, requires_action, failed, canceled and uncertain states remain distinct. Successful status also requires the charge's full refunded amount to match. A Refund object has no documented livemode field; test scope is established using the configured test key, authenticated merchant, PaymentIntent and charge instead. Provider success is not proof of bank credit. Partial/multiple refunds, previously submitted supplier orders, manual retries and live refunds remain unsupported in this workspace.

Read-only recovery remains available when the refund creation switch is off. GET status reads never call payment or supplier providers. The administrator screen uses same-origin mutations, rate limits, bounded input, no-store responses, explicit consents, stale-data clearing, one in-flight action and a request timeout. It does not store transaction secrets in browser storage or send customer mail. Existing read-only buyer links remain read-only.

## Tests and limitations
The new tests cover stop/submit concurrency, delayed-preflight stops, after-attempt rejection, loss of storage replies, changed order/destination, blocked payment reopening, preserved payment verification, full-refund identity, exact approval gates, concurrent creates, uncertain external replies, no retries after 24 hours, pending-to-success recovery, expired quotes, forbidden inputs, private projections and route permissions. Browser checks exercise real local HTTP handlers on desktop, mobile touch and keyboard/tablet with synthetic providers, including damaged HTTP responses and read-only recovery. No actual refund or supplier transaction is part of those tests.

The optional exact-branch hosted diagnostic uses actual private Blob under a unique disposable prefix, but synthetic orders and providers. It verifies stop/refund persistence, same-request recovery and cleanup; actual success must be taken from deployment logs, not inferred from this note. Restore the existing diagnostic flag to off after any authorized run. All ordinary builds must skip hosted diagnostics.

Independent AI-agent review remains outstanding. Plugin discovery returned a methodology skill and app-building service rather than an immediately usable independent reviewer for this patch; test workers are not agents. This patch does not complete public purchasing/identity, actual product-linked Stripe/TD pilots, tax/merchant-policy approval, transactional emails, shipment-delay notices, post-submission supplier cancellation or production release.

A continuation email to TD is prepared in the authorized mailbox as an UNSENT draft, requesting UAT currency, a synthetic destination, the service-code selection and explicit non-physical-fulfillment confirmation. The support facts already supplied are not treated as approval of missing order inputs.

## References checked
Stripe refund creation/list/object and idempotent-request documentation informed the adapter. Existing supplier guidance says not to resubmit an uncertain purchase order. Neither documentation nor successful tests grant business-policy approval or authority to execute an actual transaction.
