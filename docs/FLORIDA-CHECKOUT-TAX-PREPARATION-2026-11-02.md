# Florida checkout and tax preparation — November 2, 2026

November 3 continuation: the owner will file Florida returns. The registration effective date remains unknown; a supplied certificate expiry is not that date. A connected account received a read-only Stripe settings/registration review, but its use for this marketplace is not yet confirmed. See `MARKETPLACE-CONTINUATION-2026-11-03.md` for current state; earlier unverified/no-connection observations below are historical. No tax or checkout activation follows from this update.

Status: review draft, not adopted customer terms or approval to collect. The owner confirms Tri-Point Government Solutions LLC is registered to collect Florida sales tax. Registration number, effective date, provider settings and filing arrangements were not supplied or verified. Do not ask the owner again whether registered; verify the remaining details securely.

## Verified starting state
- Existing branch: `feature/td-product-controls`, draft/unmerged PR 23, stacked on `feature/site-redesign-order-management`.
- Source rollback: `0359b5790923c764ce4c038ba2881246eae9ac7c`. Main: `574c00af9004cbf3023ef8cb7f59363af758df7c`.
- Vercel project `prj_UjpRL2l0GA6wo5J0aiNS60jF822Y`, team `tri-point`. Matching preview `dpl_9nV29e7VWpSijhrSguQTLEcDWFvr` READY; SSO protection all_except_custom_domains. Repository is public; preview gating does not make source private.
- Read-only branch environment metadata: tax setup/test-tax and product-order finalization flags absent; both notification sending/approval flags false. Existing standalone Stripe sandbox demo enabled. No flags, credentials, merchant policy records or provider settings changed in this work. Metadata is not proof of runtime behavior or Stripe Tax configuration.

## Stripe configuration review packet
Review in the correct Tri-Point account and sandbox first. There is no connected Stripe tool in this session, and no authenticated Stripe settings/registration read has been performed. Existing account credentials are not evidence of correct tax setup.

Record privately: account identity/mode, head-office and actual ship-from treatment for TD dropshipments, tax settings status, Florida registration status/effective date and jurisdiction, default product/shipping codes, tax-exclusive pricing intent, and the responsible filing/remittance owner. Compare provider data with the owner's Florida registration evidence. Do not publish registration numbers, certificate images, addresses or credentials here. Do not create a live registration or enable automatic tax as part of preparation. Stripe registration configuration and legal registration are separate facts. [Stripe setup](https://docs.stripe.com/tax/set-up)

The application uses standalone Tax calculations and frozen order totals. Do not additionally enable Checkout automatic_tax on those totals: that risks recalculating or double charging. Before any live release, design and prove exactly-once Tax Transaction recording after capture and linked full/partial reversals after refunds; a calculation is not a tax ledger entry or a return/remittance. This lifecycle is not implemented by this preparation change. [Standalone Tax APIs](https://docs.stripe.com/tax/standalone-tax-api)

## Florida calculation and product review
Florida's general state rate is 6%. County surtax is destination-dependent; never hardcode one Florida total rate. For tangible goods the county surtax generally applies to the first $5,000 of a single item, with specific rules for normally sold sets/bulk/integrated units; this is not an order-level cap or a cap on state tax. Use current DOR rates and test the provider against representative destinations. [DOR surtax](https://floridarevenue.com/taxes/taxesfees/Pages/discretionary.aspx)

The adapter now sends line quantity alongside total line amount. Stripe defines amount as the line total and uses quantity to derive per-unit price. This corrects missing input; it does not prove Stripe's actual Florida cap result. The adapter also requires explicit TEST mode and a consistent tax breakdown. Missing evidence, not_collecting, not_supported, not_subject_to_tax, customer_exempt, reverse_charge and unknown reasons are held for review, even when totals sum correctly. Supported product-exemption/zero-rate reasons can yield zero only within the existing server-approved exact-SKU policy path. Customer exemption overrides are rejected. Conservative holds may block legitimate cases until a separately reviewed path exists. [Calculation API](https://docs.stripe.com/api/tax/calculations/create), [zero-tax behavior](https://docs.stripe.com/tax/zero-tax)

Prepare each initial SKU with manufacturer part, plain product description, physical/digital delivery, bundle contents, support/warranty components, proposed Stripe code, source, reviewer and review date. Keep code unset until reviewed; a valid txcd format is not legal classification. Do not approve the test fixture code as an assortment default.

| Product family | Review needed before exact code approval |
| --- | --- |
| Hardware/accessories | Specific physical product type, quantity, high-value single item versus integrated set; baseline tangible-goods treatment |
| Software | Download/SaaS versus physical media or preinstalled bundle; license rights and customization; no universal software rule |
| Installation/consulting/support | Standalone versus bundled charges, work performed and location; do not label all services exempt |
| Warranty/maintenance | Service warranty on tangible property versus software support; separable components and contract terms |

DOR software advisements are fact-specific, not blanket permission to exempt the catalog: [09A-044](https://floridarevenue.com/TaxLaw/Documents/09A-044.pdf), [15A-015](https://www.floridarevenue.com/TaxLaw/Documents/15A-015.pdf). Obtain tax-review signoff for actual products and bundles.

Delivery charges tied to taxable goods are generally taxable. Separately stating shipping alone does not make it exempt; the buyer must also be able to avoid the charge by pickup or independent delivery. Confirm actual options before selecting shipping tax treatment. Mixed taxable/exempt shipping requires review. [DOR delivery FAQ](https://floridarevenue.com/faq/Pages/FAQDetails.aspx?FAQID=1277), [mixed shipping guidance](https://floridarevenue.com/taxes/tips/Documents/TIP_22A01-05.pdf)

## Government and education purchase path — manual hold
Proposed customer wording: “If you believe your purchase qualifies for tax exemption, request review before payment. We will confirm eligibility and any required supporting documentation. An exemption request alone does not remove tax.” This wording is a draft, not published policy.

1. Identify the actual purchasing entity, delivery/use, bill-to and payer. Government contractor status, a .gov/.edu email, an EIN, a resale certificate or a purchase order alone is not a blanket exemption.
2. Use an approved private intake channel, not GitHub, browser storage, public uploads or this free-text setup form. Confirm authorized staff, retention rules and certificate access before enabling intake.
3. For eligible Florida state/local entities, schools and nonprofits, verify applicable current DR-14 evidence and transaction eligibility. Federal direct government purchases have a different evidence path; DOR says federal entities need not obtain DR-14. Do not require an invented federal certificate number.
4. Verify direct organizational payment. Personal payment later reimbursed does not qualify under the nonprofit certificate rule. Distinguish centrally billed government cards from individually liable cards; send ambiguous cases for review.
5. Save reviewer, time, evidence reference, legal basis, entity/payer/destination and applicable items privately. An approved document is not a perpetual exemption for every buyer or transaction. Recheck expiry/revocation and invalidate approval when relevant order facts change.
6. Only a separately implemented and tested server-controlled path may bind approval to an exact order and provider override. Today the existing finalizer accepts calculated tax only; no customer exemption bypass or tax-free payment link is created. Unresolved cases stay unpaid/on hold rather than charged and presumed refundable later.

[DOR nonprofit, government and school exemptions](https://floridarevenue.com/taxes/businesses/Pages/nonprofit_sales_tax.aspx), [school organizations](https://floridarevenue.com/taxes/businesses/Pages/sales_schools.aspx)

## Purchase policy clauses prepared for owner review
These are proposals to refine in the existing `/admin/checkout-setup` draft workspace. Nothing here writes the approved merchant policy.

- Price and tax: “The order review will show item prices, shipping and applicable tax before payment. A changed quote requires a new review and acceptance.” Confirm tax-exclusive display and who absorbs supplier freight differences.
- Availability: “Availability and delivery dates are estimates until supplier acceptance. Payment does not itself reserve inventory.” Confirm shortage/backorder handling, partial shipment consent and cancellation/refund timing; no substitution without customer approval.
- Shipping: confirm destination restrictions, actual service options, split shipments, freight accessorials and damage reporting. Do not promise free shipping from a supplier benefit or guarantee a ZIP freight estimate.
- Cancellation: “Request cancellation promptly. After supplier submission, cancellation requires confirmation and may not be possible.” Owner must approve cutoffs and remedies; a local release stop is not supplier cancellation.
- Returns: require a reviewed item-specific eligibility/RMA process before returning goods. Owner must set windows, exclusions, restocking/return freight and handling of unopened software/custom items from supplier terms; no invented universal window.
- Warranty: identify manufacturer coverage versus Tri-Point support and establish DOA/damage contact and response time. Do not imply additional manufacturer coverage.
- Refunds: specify original-payment treatment, item/shipping/tax amounts, approval and communication. Reconcile uncertain refund requests before retry; provider success is not proof of bank posting. Partial refunds and tax reversals need implementation/validation before supporting them.

TD fulfillment responsibilities remain awaiting clarification from the existing correspondence; no new email was sent or responsibility assumed. Approved sender/recipient choices remain valid and must not be requested again.

## Verification and operational gates
Local tests use synthetic providers only. Required future controlled provider cases: correct account and active sandbox Florida registration; full address and current county rates; one $6,000 item; two separate $6,000 units; reviewed integrated set; taxable shipping and mixed basket; qualifying digital product; unsupported location and missing registration; reviewed direct federal/state purchase; invalid/expired evidence and personal payment; tax-code/address/quantity/freight change; exact payment amount; webhook replay; tax ledger entry and full/partial reversal without duplication. Compare actual expected rates/caps with current DOR rules; do not infer a passed provider test from mocks.

No payment Session, charge, refund, Tax Transaction, supplier order, automatic email, live registration or production tax activation is authorized by this document. Preserve admin authentication, preview-only gates, exact policy approval, captured-before-supplier release, idempotent recovery and private records.

## Precise remaining owner inputs
1. Secure confirmation of Florida registration effective date and legal entity match, plus the designated return/remittance owner. Keep registration numbers/documents out of chat and repository.
2. Read-only review of the intended Stripe account's tax settings and Florida registration in the correct mode; confirm head office and TD ship-from approach. Do not send API keys.
3. Initial exact product list with delivery format, bundles, software/support/warranty details and proposed tax classifications for review.
4. Approval of shipping destinations/options, treatment of quote differences and split shipments; return/cancellation/DOA/warranty terms and customer support process.
5. Exemption reviewer, secure evidence intake/storage and retention, eligible entity/payer verification procedure.
6. Separate later test authorization and synthetic order inputs; TD UAT currency, destination/service and no-physical-fulfillment assurance remain unresolved. Public guest/account choice and eventual release authorization remain separate.
