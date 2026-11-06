# Internal multi-retailer price comparison

Local business date: October 19, 2026. This release is a preview feature on the existing product-controls branch, not a public pricing or launch action.

## Owner requirement and current integration milestone

The owner asked to add an average price found across multiple sources such as Newegg and Walmart. Their preceding website screenshot showed a real saved Lenovo 21KCS4S600 / TD 14790211 observation: Active, production, amount 1364.21, reported quantity 0, currency unconfirmed. That is user-provided evidence of the hosted lookup, not a fresh quote or an independent current recheck in this change.

Keep distributor cost, Tri-Point selling price, retailer comparison, MSRP, and manufacturer MAP as separate concepts. The approved 15% default and overrides are unchanged. Retail comparison never triggers automatic repricing, publication, payment, email, or a supplier purchase.

## Delivered in this change

Each saved product has a **Compare retail prices** control. Its private comparison view shows recorded average and median item prices, low/high item-price range, eligible retailer count, observation dates, a separate shipping-inclusive average and source count, and the difference from a verified Tri-Point suggested item price when one exists.

Source records retain a retailer, direct product link, staff-assigned seller-group identity, complete manufacturer/part number, item amount, known/unknown shipping, currency, condition, availability, quantity, bundle/promotion flags, observation time, configuration/warranty-review attestation, and destination ZIP. The first interface provides research links and manual reviewed observations for Newegg, Walmart, Amazon, B&H, CDW, Best Buy, Lenovo and HP. These are supported research destinations, NOT live API integrations.

**Automatic retailer collection is not connected.** No real retailer offers were fetched, seeded, or claimed in this implementation. Recalculate re-evaluates existing evidence without contacting a retailer or changing its check time. Any later automated provider must supply permitted, traceable observations through a reviewed server-side adapter and must not simply mark a title match as verified.

## Comparison definition

- New, in-stock, unbundled, single-unit offers with the exact saved manufacturer and full part number, including option suffixes; configuration/warranty must be reviewed.
- Ordinary public USD price, not an MSRP substitute, private quote, coupon, membership, rebate or conditional discount.
- Same user-selected US delivery ZIP. No destination is assumed from the user's location or customer account.
- Actual check time within 24 hours, evaluated when the summary is read. Missing prices are unavailable, never zero.
- One current recorded offer per retailer. Saving a new out-of-stock observation replaces the earlier in-stock observation instead of resurrecting it.
- Duplicate staff-assigned seller groups count once across retailers. Identity/independence is explicitly a manual attestation, not software proof; aliases must use the same group.
- Two eligible retailers/seller groups permit an average with a limited-sample label. A single observation is displayed but not called a multi-source average. Three or more is a broader sample, not a statistically representative market survey.
- Missing shipping does not mean free shipping. Item-only and shipping-inclusive averages use separately reported eligible counts. Tax is excluded from both.
- Tri-Point product-price comparisons use the item-only average, not a shipping-inclusive benchmark. No comparison appears until the normal verified selling-price calculation is available.
- Large price spreads are flagged without silently discarding inconvenient observations. Mean and median are both retained.

## Security and data preservation

The existing product API authentication, same-origin checks, non-production gate and action allowlist apply to reads and writes. Retail links are HTTPS and constrained to supported retailer product paths; query strings and fragments are removed. Links are never fetched by the server in this release, so adding evidence does not make an arbitrary network request.

Comparison books are separate, private, bounded per-product records under `preview/market-price-evidence/`. Product selection, existing TD observations, approvals, markup rules, contractor records, and inquiries are not migrated or rewritten by deploying the feature. Version/conflict checks prevent concurrent overwrites. Product identity changes invalidate old comparisons. Customer-safe product projection remains unchanged and does not include retailer evidence, costs, or comparison claims.

No production variables, tokens, account settings, gateway code, or paid provider subscriptions were changed. No scheduled refresh was created. No HP documents or price workbook were committed to the public repository.

## HP boundary

The uploaded HP General MAP Policy prohibits certain public price-matching/lowest-price claims, uses Net Adjusted Price for covered offers, and does not make an automated quote email a general exemption. This internal comparison is not an HP MAP determination or MSRP calculation. HP qualification, restricted SKUs, embargo, MAP effective-date handling and public-content controls remain separate pending publication gates. Do not advertise competitor-derived savings or reprice below an applicable MAP on the basis of this feature.

## Why automated collection is a separate integration

Current first-party documentation reviewed:
- Newegg Get Item Price requires a Marketplace seller ID and seller authorization: https://developer.newegg.com/newegg_marketplace_api/item_management/get_price/ . This documentation does not establish a general competitor-price feed for this project.
- Walmart's documented marketplace price-incentive data is for items in the seller catalog: https://developer.walmart.com/us-marketplace/docs/retrieve-price-incentives-data . It does not establish an unrestricted multi-retailer price API.
- eBay Browse supports searchable listings and product-detail reads using an application token: https://developer.ebay.com/develop/api/buy . This is a possible future source, subject to access/terms and product-matching review; it does not supply Walmart/Newegg prices.

No approved retailer data feed or pricing-intelligence provider was found in the retrieved project decisions. Plugin discovery did not return a fitting connected retail-price service. Selecting and authorizing a suitable feed remains necessary for reliable automatic collection; the source records and aggregation logic are prepared, not misrepresented as connected.

## Verification

All prior 403 tests were preserved. This change adds 28 comparison validation/aggregation/service/security tests. Local browser checks exercise imports, modal entry, two/three-source arithmetic, shipping exclusion, manual seller checks, retailer links, replacing out-of-stock evidence, ZIP isolation, customer-data isolation, mobile/tablet/desktop layouts and session expiry. All evidence uses labeled synthetic products and prices; no external requests are permitted in the browser test. Hosted real evidence persistence remains to be exercised by the administrator. A new full accessibility certification is not claimed.

Next: review the preview control; choose an authorized multi-retailer collection source and its usage/cost limits before adding an automatic refresh worker. A separate review is required before displaying any retailer comparison publicly.
