# Launch-blocker preparation — October 29, 2026

## Scope and baseline
The user requested continued work until the marketplace is ready for live use. This patch repairs one known TEST-provider configuration gap and prepares an unapproved merchant-policy draft, rather than adding another checkout screen or declaring readiness from simulations.

Baseline and rollback: 6964b0dae5942ebaf58f053b3be10cc63dcee531. Branch: feature/td-product-controls, draft PR 23. Main was independently observed at 8c8dd7e200dd83e055de6276b73b04be795d646c. Main, public production, authentication/protection, live payments, supplier purchasing, tax registrations and business approval flags are not changed by this patch.

## Exact-commit maintenance
The build script `scripts/prepare-launch-blockers.mjs` is default-off. It requires Preview, the exact feature branch and stable Preview hostname, and TP_LAUNCH_PREP_COMMIT equal to the deployed 40-character source SHA. It must be restored to off and independently read back after execution. Existing read-only audit and hosted write-canary flags remain off. No HTTP route is added, and the theme build stays last.

The script authenticates only an existing Stripe TEST key and verifies the configured account. It requires a complete first webhook list page and one exact enabled test endpoint for the known stable Preview `/api/payment-events` URL. It re-reads that endpoint before updating, holds on detected drift, and adds only `checkout.session.completed` to the existing subscriptions. The URL (including any private query parameters), API version, description, metadata and other endpoint identity are preserved. There is one POST, no automatic retry; a fresh readback is required after both successful and uncertain responses. Stripe has no compare-and-swap parameter in this update operation, so the pre/post checks reduce but cannot eliminate concurrent-operator races. Coordinate edits; any unexpected readback is held for review, not silently rolled back.

When the endpoint is verified, a deliberately unrecognized synthetic NO-OP event is sent to its existing configured URL. An invalid signature must be rejected as JSON/400 before a correctly signed event is expected to return JSON/200 with received=true, ignored=true and realSupplierDispatchAllowed=false. The payload contains no payment or order identity and is handled by the existing signature-verifying route. It does not request any payment/order mutation. The existing URL is used internally; its query secret is not logged, displayed or replaced. No Stripe authorization header is sent to the webhook. This verifies application transport/signature handling only: it is NOT an actual Stripe-delivered checkout event or a completed product-linked payment test.

The script also reads the existing test Tax Settings to identify whether `head_office` is required. It does not set an address, registration, product classification, tax-approval flag or zero-tax assumption. Missing values are reported without private tax data.

## Create-only proposed merchant draft
`ops/merchant-launch-proposal.json` contains generic proposed wording, not confidential records or adopted customer terms. The proposal is written through the existing private checkout-setup service only when no draft exists, using expected revision zero. Existing drafts are preserved and any concurrent creation/save uncertainty is reported. The saved result must be independently read back with matching content and approved=false/checkoutActivated=false.

The proposal covers a limited initial hardware assortment, transparent totals, supplier-linked shipment estimates, delay notices, cancellation, proposed 30-day unopened-item returns, warranty evidence, refund operations, verified tax inputs and secure buyer support. The suggested geography, returns policy and support commitments require owner review and supplier feasibility; they are not user decisions. Buyer access remains undecided and product classifications remain empty. The draft explicitly says it cannot be displayed as approved checkout terms. No final-order merchant-policy record or activation flag is written.

The chosen Stripe provider, captured-before-supplier flow and existing 15% default markup are preserved. Public buyer purchasing, identity selection, actual end-to-end Stripe/TD testing, notification/refund operations, invoice-cost controls, independent review and integration with current main remain separate requirements.

## Tests and evidence
Twenty new tests exercise exact-commit/host/branch gates, actual raw webhook handler signature checks with synthetic events, additive subscriptions, preservation of endpoint identity, idempotent reruns, wildcard coverage, account/live-key rejection, ambiguous listings, concurrent drift, lost replies, failed writes, HTML protection responses, invalid signature acceptance, draft-create/readback, existing-draft preservation, invalid proposal rejection, tax read-only behavior and secret redaction.

The complete suite has 1,254 tests: 1,245 pass and nine optional hosted-storage diagnostics remain skipped. Sequential execution and randomized four/eight-worker runs passed with zero failures. Clean Preview and production-mode builds passed and both new maintenance and existing audit skipped without opt-in. These results are development verification, not proof the planned hosted changes occurred. The verified checkpoint must record actual hosted output, exact commit/tree, deployment READY state and switch shutdown before any external success is claimed.

No new browser UI was introduced; no independent AI reviewer was invoked. Test workers are not agents. No extra supplier-support email was sent during preparation; the existing support thread was read and contained only the previously sent request at that check.

## Reference material reviewed
Stripe webhook endpoint update: https://docs.stripe.com/api/webhook_endpoints/update
Stripe Tax Settings object: https://docs.stripe.com/api/tax/settings/object
Stripe signature and delivery guidance: https://docs.stripe.com/webhooks
FTC merchant shipping/delay/refund guidance: https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule
Florida tax registration and resale guidance: https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx

Legal/tax material informs review questions and required operating controls; it does not substitute for merchant-specific tax facts or approve this draft.
