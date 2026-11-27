# Smart pricing and TD freight — private scenario release

Date: October 20, 2026. Parent implementation: 78c8cb21a776186a6c80e0f222789bdb41112e7b. Existing review branch: feature/td-product-controls / draft PR 23.

## Owner direction versus proposed settings

Owner requested this priority: use the lowest comparable US price when TD acquisition cost permits a profitable match/aggressive price; otherwise evaluate the US average; preserve profit rather than chase an uneconomic sale. Owner also reported free TD shipping when the order is **over $1,000 and under 100 pounds**.

The existing 15% markup and category/manufacturer/product overrides are preserved. This change adds private calculations, not a public pricing update. Starting smart-policy suggestions are **0.5% undercut, 5% minimum contribution margin, and $5 minimum contribution profit per order**. They are editable and are initially explicitly unconfirmed. They are implementation proposals, not prior owner-approved policy.

The freight rule is recorded as an owner-reported account benefit, not independently certified TD contract language. For conservative planning, the value threshold uses TD acquisition merchandise subtotal, excluding tax and fees—not the customer selling price. The owner should review that threshold basis against their account terms before relying on a live quote. The weight is complete packaged shipping weight, not device net weight. The code does not infer it from product family or title.

## Delivered workflows

1. **Smart price** per saved product and **Smart pricing & freight** for a multi-product scenario.
2. Lowest qualifying US delivered-unit competitor comparison, average fallback, and protected cost-plus reference if market matching is unavailable or uneconomic.
3. An order-level shipping/fee calculation for up to 20 unique saved product lines, with quantities, reviewed packaged weights, freight quote override, customer shipping separately, payment percentage/fixed fee, contract/admin percentage, reserve, handling, other order costs and extra payment-fee base such as collected sales tax.
4. Private revisioned strategy settings and immutable, reference-addressable saved scenarios. Saved snapshots can be reopened without a new TD or SerpApi request.
5. Explicit US actual-seller and US shipping-origin review fields in the existing manually reviewed retail-offer form. Existing records remain unknown; no bulk US approval is inferred.
6. A visible hold/next-action report for stale TD data, currency uncertainty, insufficient stock, incomplete resale/content/condition review, unreviewed advertising restrictions, embargo, missing cost inputs, or unprofitable comparison targets.

## Decision algorithm and arithmetic

Only reviewed offers matching the exact manufacturer and full part number, new/unbundled/single-unit condition, confirmed stock, USD, the same delivery ZIP, known shipping, and reviewed US actual-seller/US fulfillment provenance enter the smart benchmark. A .com domain, a marketplace brand or a dollar symbol is not evidence of a US seller. Duplicate actual seller groups and retailers do not inflate the mean. Single-source prices cannot create a multi-source average. The general unverified research average remains visible elsewhere but does not drive these competitive recommendations.

Compare pre-sales-tax delivered-unit amounts, not competitors' merchandise-only numbers against a customer-shipping-inclusive quote. The engine tests the lowest price first. It targets the configured undercut, narrows the discount or matches if needed to protect the floor, and only moves to the average when the lowest is not feasible. An average fallback is clearly labeled **not the lowest US offer**. It never increases a floor-violating target and still calls it a successful match.

The protected floor covers TD acquisition cost, allocated supplier freight, handling, other order costs, payment fees (including their extra tax-related fee base), contract/admin costs, reserve, required contribution dollars and required contribution margin. Fixed costs and minimum order profit are allocated exactly once using largest-remainder integer-cent allocation. Percentage costs round upward per line, conservatively. A binary search obtains the first safe price cent. Contribution is not net income: unmodeled overhead and income tax remain outside this calculation.

Known current MAP entered during the scenario is a hard price floor. Unreviewed or embargoed products remain held. There is no automatic HP MAP workbook import, no inference of resale eligibility, no dated-contract price-ceiling automation and no claim of public-advertising approval. Contract-specific ceilings, product authorization and terms must still be reviewed before a government contract quote.

The default strategy caps an aggressive target at the existing cost-plus markup unless a higher floor is necessary. No feasible lowest/average price produces an **uncompetitive review**, not a loss-making recommendation. No comparable eligible offers produces a clearly labeled cost-plus-only private estimate. Stale or currency-unconfirmed TD data can support held analysis, never a current, authorized public offer.

## Exact freight boundaries

- $1,000.00 does not qualify; $1,000.01 can qualify if all other conditions are known.
- 100.000 lb does not qualify; 99.999 lb can qualify.
- Unknown weight never means zero weight.
- One eligible supplier-order/shipment must satisfy both thresholds. Do not aggregate unrelated orders or assumed split shipments to qualify; use a reviewed freight quote for those cases.
- A reviewed actual freight quote overrides the account-rule estimate, including a nonzero charge on an otherwise qualifying order.
- Customer shipping revenue is a separate input. Free TD freight does not automatically promise free customer shipping.
- Recalculate after quantity, weights, fees, supplier availability or shipment grouping changes. The threshold and cost savings are not frozen from an earlier cart.

## Privacy, persistence and authorization

Uses the existing administrator-only product-controls API, no-store responses, same-origin mutation checks, action allowlists and non-production gate. No new public API or purchase action. The server loads acquisition amounts and approved market offers from saved data; browser requests cannot inject arbitrary supplier costs or publish flags.

Private settings and saved case records use a separate preview/smart-pricing namespace. Settings use compare-and-swap. Cases are immutable and protected by request-reference/input-hash idempotency. Repeating an unchanged request returns its original timestamped snapshot; changing inputs under the same reference is rejected. An evaluation rechecks current product and strategy revisions before saving. Snapshot retailer observations retain source and observed-at evidence; the saved result is not a live quote.

No customer prices, existing cost-plus rules, product approvals, original catalog, credentials, checkout, payments, emails or supplier orders are changed by this feature. Source-country review is a staff attestation with a source/date reference, not a guarantee supplied by an automated geo-detection service.

## Verification

- 547 automated tests passed: prior 492 plus 55 new model/service/store/API tests.
- Fifteen isolated browser workflows passed using synthetic products/offers and memory-only storage. Covered US provenance, default-policy confirmation, lowest-to-average fallback, free freight at qualifying quantity, quantity/weight boundary changes, explicit freight quote, immutable snapshot reload, multi-line UI, mobile/tablet/desktop bounds, customer-data isolation and session expiry.
- No real external provider requests or hosted data writes were made during local testing. A local Add product selector defect was found by the browser suite, corrected, and the suite rerun successfully.
- Optional additional accessibility scan was blocked by the tool layer and is not claimed as passed. No alternate scan was used to bypass that restriction.
- The first independent full-source review helper failed. A narrower arithmetic review ran; its two reported bound concerns were checked against the actual maximum-unit clamp and validated quantity range. These review outputs are not substitutes for the passing test suite.
- Preview and production-mode builds are verified before the branch commit. The hosted new feature still needs an administrator's real scenario save/read verification; READY deployment alone does not prove live record persistence.

## Next launch steps

Confirm USD account currency and fresh stock, verify eligible US offers, confirm actual payment/handling/reserve assumptions and packaged weights, review advertising restrictions/MAP and contract ceilings, then evaluate a small real scenario. Order checkout, tax service, payment authorization, inventory revalidation, supplier purchase-order dispatch, and shipment notification remain separate release gates. No production activation is authorized or performed in this stage.

Technical reference: Vercel private Blob and conditional-write semantics, https://vercel.com/docs/vercel-blob . Owner shipping terms come from the current conversation, not that documentation.
