# Marketplace continuation - November 3, 2026

## Separately authorized public quote release
The owner approved a multi-item website quote form, private staff storage, and internal alerts to the existing public info mailbox. PR 27 was merged into main at `98250d67c66b964aaa24f1ef362108c879b74247`, source commit `6cd257a01018659f775e072950d0fc7d10aef412`, tree `c4a3a018ba45128f6fed280d39a908a0ceabdfb9`. Production deployment `dpl_6YTYbpbKRPiqZm3FKWaeDPV9Uzsz` independently reported READY with the exact main commit, production target, custom domains and no alias error. Rollback is `d3db4f1f26707b83b66fe6f0973ef3b26c3be768` / `dpl_9wYZPeUPNuJxeBZNEYZ6StkRE7N3`.

The public /marketplace and /contact support multiple items, quantities, brands, interests, custom requirements and a tax-exemption review request. Staff review uses /admin/inquiries with existing server-side admin authentication. Storage separates preview and production; preview never sends. Internal alerts contain a reference and private staff link, not buyer details. No customer confirmation, checkout, payment, supplier order or automatic exemption is introduced.

A clean build and 282 tests passed. Local browser checks covered desktop/mobile, staff review, one-record/one-alert recovery after a lost response, and readable layout. Hosted preview served the correct form and denied anonymous staff data. Production UI checks passed at 1440px, 390px and 320px. One explicitly identified synthetic website-verification request was saved and independently read back, then the identical POST returned the existing reference. Its sole internal alert was independently found in the intended Gmail inbox; SPF, DKIM and DMARC passed. Private test references remain outside this public repository. The live crawl checked 75 HTML pages with no broken internal links or overflow. Two existing RSS XML display CSP warnings remain; no CSP relaxation was made.

The public release was isolated from this feature branch. Do not merge all of PR 23 to release quote improvements. Public main now contains the new quote implementation; reconcile its files deliberately before future checkout integration. The authorization for internal quote alerts does not authorize order/customer email automation.

## Owner and provider facts
The owner confirms Florida sales-tax registration and will personally handle filing. The effective date remains outstanding. A certificate expiry was supplied separately; certificate type and effective date must not be inferred from an annual expiry. No registration number or certificate document was collected.

Read-only Stripe access became available. The connected account returned active live-mode Tax settings, a Florida head-office address, inferred tax behavior, and default code `txcd_20030000`. Listing all tax registrations returned no entries and has_more=false. This is a snapshot of that connected account, not confirmation of the marketplace's intended account. The account's existing separate-brand identity requires an owner decision before use; no identity, descriptor, registration, setting or credential was changed. No test-mode Tax configuration was verified. Account identifiers and exact address are retained privately.

Stripe identifies that default code as General - Services and supports product-specific codes; do not adopt it as a universal hardware/cloud/license catalog classification. Prepare exact SKU/delivery/bundle evidence and review the applicable code before approval. [Product tax codes](https://docs.stripe.com/tax/tax-codes). Legal registration and adding a registration to Stripe remain separate steps; no registration or collection was activated. [Registration configuration](https://docs.stripe.com/tax/registering).

## TD correspondence scope
Fresh mailbox review found the API team's response and the sent sales follow-up, with no later sales confirmation. API scope confirms customer dropship request fields, order/PO status, invoices, estimated freight, duplicate rejection and sales-managed post-submission changes. Technical/API timeouts or integration issues go to PartnerFirstNAAPI@tdsynnex.com. An uncertain submission still requires reconciliation; a timeout is not permission to resubmit.

Sales/account confirmation is still required for acceptance/rejection/reservation and price changes; backorder/partial allocation rules; blind shipping, packing slips and wholesale-price confidentiality; customer versus reseller notifications and suppression controls; final freight/tax/credit/invoice treatment; and cancellation, damage/loss, return/RMA, warranty and refund responsibilities. The API team's general handling statement does not establish those detailed commercial commitments. The requested sales follow-up was sent; do not mark it answered or repeatedly resend it without cause.

## Paid-checkout requirements still open
- Intended Stripe account and marketplace branding; confirm the correct-mode account/settings/registration before a test pilot. No production collection activation.
- Florida registration effective date and legal-entity match; head-office/actual TD ship-from treatment; exact product/shipping classification and tax-exclusive display review. Filing owner is now answered.
- Exact initial SKU/assortment, configuration, bundle, digital-delivery and warranty/support facts; merchant return/cancellation/shipping/DOA/warranty/support terms.
- Named exemption reviewer, secure evidence channel, retention and transaction-bound eligibility checks. The general form checkbox is a review request only.
- TD sales confirmations above and separate UAT currency, approved synthetic destination/contact/service, assurance of no physical fulfillment and explicit spend ceiling.
- Actual product-linked Stripe TEST payment/events/recovery; separately authorized TD UAT submission/status/invoice reconciliation; exact test refund and Tax Transaction/reversal lifecycle. Standalone tax calculations are not a tax ledger or filing.
- The website's exact-order TEST notification confirmation/recovery pilot still needs its protected dedicated credential and valid finalized test order. Existing approved sender/test recipient remain selected; the quote alert credential/recipient does not substitute for that pilot.
- Public guest/account choice and a separately approved paid-checkout release after policy, accounting and pilot evidence.

Preserve captured-before-supplier release, server authentication, private records, exact reviewed totals, durable attempt reconciliation and no blind resends. No policy approval, payment/refund, tax transaction, supplier purchase or customer email was performed in this continuation.
