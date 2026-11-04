# Shared Stripe account and marketplace payment labels

The owner selected the existing merchant account used for Spoken Letters for Tri-Point's marketplace on November 4, 2026. This supersedes the earlier separate-account choice and connection request. A fresh read of the selected connected account confirmed Tri-Point Government Solutions LLC as the company, the existing Spoken Letters business profile, and the current SPOKEN LETTERS statement descriptor. Account identifiers and credentials remain outside this public repository.

## Payment organization

New saved checkout attempts add `tp_business_unit=TPGS Marketplace` to both Checkout Session metadata and PaymentIntent metadata. Existing order ID, version, quote digest and flow values remain present. The payment description includes the label and server-owned reference:

- Product-linked TEST checkout: `TPGS Marketplace | TEST order <order ID>`.
- Fixed connectivity test: `TPGS Marketplace | SANDBOX TEST <test ID> | No goods or services`.

These are the existing TEST-only flows. No live checkout flow is added. A future live implementation must use the reviewed label and an appropriate live order description rather than copying the TEST wording unchanged.

For supported Stripe payment searches, use `metadata["tp_business_unit"]:"TPGS Marketplace"`. The metadata is an organizational label, not payment proof or an account boundary. Stripe copies PaymentIntent metadata to its newly created Charge as a one-time snapshot. Existing Session/payment/Charge records are not backfilled. [Stripe metadata](https://docs.stripe.com/metadata), [Stripe search](https://docs.stripe.com/search).

Descriptions may be visible on customer-facing payment details. They contain only the business label, TEST purpose and an order/test reference, not buyer contact details, addresses, product free text, tax identifiers or credentials. No account-wide branding, statement descriptor, receipt setting, customer metadata or other-brand record is changed. Internal metadata does not rename the bank statement entry; the existing shared-account branding and statement descriptor still need review before paid public checkout.

## Recovery and release boundaries

The saved creation attempt pins `stripeMemoVersion=1` for new attempts. A retry uses that saved version. An older saved attempt with no version retains its original parameters and idempotency key; no new memo is inserted into an already uncertain external creation. Existing open Sessions are reused. Unknown versions require reconciliation before another provider create call. The label does not change prices, taxes, capture policy, payment matching or supplier release checks.

Unit/integration verification covers both new checkout flows, metadata propagation, unchanged order binding and totals, byte-equivalent uncertain retries, legacy retries, and rejection of unknown saved versions. All provider transports in those tests are synthetic. No new Stripe Session, payment, refund, Tax registration, supplier order or email is created for this change.

The previous Florida Tax snapshot remains historical evidence for the now-selected shared account: Tax settings were active in live mode with a General - Services default and an empty registration list. Sharing the account does not approve that default for the catalog or enable Florida collection. The certificate effective date remains not shown/unconfirmed and the owner handles filing. Exact product/policy/exemption review and controlled provider pilots remain separate requirements.

The existing private feature branch and draft PR 23 hold this preparation. Payment, production tax and supplier purchasing gates remain unchanged. Do not merge the whole feature branch to publish this internal labeling change. Roll back to the parent checkpoint if needed.
