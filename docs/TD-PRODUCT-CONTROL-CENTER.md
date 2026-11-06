# TD SYNNEX product retrieval and selection — staged implementation

Date: October 19, 2026
Parent: `ebd060e3617d5cb038718c75693b7769d874896d`, existing redesign/contact/logo review branch.

## Scope and purpose

Tri-Point is building a public purchasing marketplace. This stage adds the private Product Control Center at `/admin/products`: find supplier products, import selected identities as drafts, retrieve current supplier observations through a read-only adapter, filter the saved product selection, and record product-level exclusions and review evidence.

This does not publish a product, activate checkout, reserve inventory, collect money, submit a TD purchase order, or send an email. Both the new API and its persistence adapter reject production-environment access in this release. The approved website design, updated logo, contact form, existing private catalog, contractor workflows, and order simulation are preserved.

## Two distinct sources, not one giant API search

1. The existing Windows SQLite catalog mirror supplies keyword, manufacturer, approximate category, and exact-part/SKU discovery. The gateway returns 50 rows per page. The original gateway and its local launcher are unchanged.
2. TD SYNNEX GetPriceAvailability supplies account-specific status, regular-price fields, reported quantity, warehouse quantity, and supported flags for exact identifiers. The adapter implements only OAuth plus this read-only endpoint.

The imported snapshot is not current stock. Its raw fields 10/11/13/14 are discarded when creating product drafts. No raw-feed price is used in the pricing engine.

The supplier search response is explicitly one source page. Import re-fetches that page on the server and verifies each numeric TD SKU and manufacturer part number. Descriptions, cost, and approval state cannot be forged in the import request. Duplicate or missing identities are held back. Manufacturer-part API searches that expand to several SKUs are marked ambiguous rather than selecting an arbitrary result.

## Saved-selection filters and exclusion rules

The pilot selection supports up to 500 products, with 25 results per display page. This is a bounded private selection, not a limit on the underlying supplier catalog. An indexed production product database is required before scaling a public storefront to the whole eligible catalog.

Filters operate across the complete saved selection BEFORE pagination:
- Keyword, manufacturer, product category, and reviewed condition.
- Verified production quantity: in stock, out of stock, or unknown.
- Draft/review-ready and excluded/not-excluded status.
- Suggested Tri-Point selling-price range and price/stock/name/manufacturer sorting.

Exclusions support exact manufacturer name, category, exact manufacturer part or TD SKU, literal description phrases, accessories, unknown/non-new condition, and individual product decisions. They never delete supplier records. Restoring an individual product does not override an applicable manufacturer/category/keyword rule. Re-importing a product preserves its individual exclusion. Identity changes clear old observations and rights review; copy changes invalidate public-content review.

Source product categories are labeled approximate. The system does not infer condition, resale authorization, public-content rights, TAA compliance, or other procurement eligibility from a keyword or an Active API status.

## Pricing and current-data protections

The approved default remains 15% markup. The existing engine provides category, manufacturer, SKU and manufacturer-part overrides. The UI edits the default plus category/manufacturer/SKU overrides; existing manufacturer-part overrides remain preserved.

Suggested selling prices require a fresh, identity-matched production observation, explicit REGULAR price context, separately confirmed USD account currency, and recorded product resale review. Zero, missing, stale, malformed, failed or UAT prices do not produce a selling price.

Launch-review readiness additionally requires confirmed classification, new condition, public-content review, positive reported production quantity, and no unresolved end-user/parcel-shipping flag. "Ready for launch review" is not checkout authorization. Freight, tax, processing fees, final price/stock recheck, customer/channel restrictions, and operational approval remain separate.

Missing stock remains unknown, not zero. Warehouse zero (reserved inventory) is excluded from the normal quantity pool; total and warehouse quantities are never added together. Where both are available the smaller non-reserved reported pool is used. No inventory is reserved.

Refresh supports 1–20 saved products per UI operation; the underlying adapter supports a validated batch of up to 100 identifiers, consistent with the supplied API contract. HTTP 200 business errors are handled separately from valid product responses. Responses match by lineNumber, never array order. Business errors use a fixed safe code allowlist; raw error details are not persisted or returned. Redirects are blocked, token/JSON/body sizes are bounded, account echoes are checked, and OAuth access tokens are cached only in the server adapter instance. A failed latest check clears the previous observations for the affected items.

## Connection state independently checked in this stage

Only Vercel variable names and targets were inspected; no values were decrypted or changed.
- Existing `TP_CATALOG_API_URL` and `TP_CATALOG_API_TOKEN` entries target production, not preview.
- Private Blob configuration exists for the project, including preview.
- No TD OAuth variable names were found in the inspected project metadata.

Accordingly, the new workspace has NOT performed a real hosted TD lookup or a real gateway import in this stage. The owner's previous UAT OAuth/Active-product response remains a separate historical success, not production pricing verification. Credentials and gateway settings must be provided through an approved server-secret workflow, not chat or public code.

Server configuration contract:
- `TP_TD_CLIENT_ID`, `TP_TD_CLIENT_SECRET`, `TP_TD_CUSTOMER_NO`.
- `TP_TD_API_ENVIRONMENT=uat` or `production` (UAT is the safe default).
- `TP_TD_READONLY_ENABLED=true` enables the configured read-only adapter.
- Production calls additionally require `TP_TD_PRODUCTION_READS_APPROVED=true`.
- `TP_TD_ACCOUNT_CURRENCY=USD` only after account currency is confirmed.

None of these flags has been set by this change. Do not automatically copy production secrets into every preview branch. The connection panel reveals configuration readiness without exposing credential values.

## Data and access boundaries

`/api/product-controls` and `/admin/products` require the existing signed administrator session. Contractor sessions and anonymous visitors cannot read the workspace or its customer-safe projection. Mutations require same-origin requests and strict action/field validation. There is no public publishing or supplier-order action.

A private versioned aggregate is stored under `preview/product-selection/workspace-v1.json`, separate from inquiries, contractors and orders. Compare-and-swap prevents concurrent imports/reviews from overwriting each other. The bounded store is a pilot repository, not the future full production index. No hosted records were created in this implementation test.

The customer preview is an explicit allowlist: display name, manufacturer, public part number, category, condition, suggested selling price, and availability label. It excludes distributor cost, markup strategy, warehouse addresses, supplier response bodies, approval notes, and secrets. It is still an internal preview and never enables checkout.

## Verification performed

- 403 automated tests pass: 315 baseline tests and 88 new adapter/model/service/store/API checks.
- 19 local browser workflow groups pass using 65 clearly labeled synthetic records and an in-memory store. They cover two-page import, full-set filtering, exact SKU search, stale/unsent-filter handling, review, exclusions, override precedence, customer projection, quantity classification, batch limits, mobile/tablet/desktop layout and session expiry.
- No browser JavaScript errors or external requests were recorded in that isolated run.
- All three workspace panels were checked at 390, 768, 1024 and 1440 px with no page-level horizontal overflow; wide tables scroll inside their containers.
- An independent code review identified that unrecognized supplier error strings could expose data. The adapter was changed to a fixed error-code allowlist and regression tests were added.
- The additional automated accessibility scan was blocked by the tool layer and is NOT claimed as passed. The earlier site's accessibility results do not certify this new screen.
- Clean preview and production-mode builds are checked separately before the review branch is committed. Live hosted storage, production supplier behavior, and a Windows execution of the separate verification script remain pending.

## Next executable milestones

1. Perform the read-only production API verification using the existing OAuth credentials locally. Inspect actual regular price, quantity, identity, flags, and account currency; no supplier order is needed.
2. Approve and configure only the necessary private preview gateway and read-only TD settings. Verify one live source import and one exact-SKU API check through the authenticated workspace.
3. Review manufacturer/channel and public-content rights, select a small starter product range, and set any desired exclusion/markup rules.
4. Build the indexed public product store and customer-facing filter experience from reviewed, eligible product projections; keep supplier cost and secrets server-side.
5. Complete customer accounts, cart/checkout, freight/tax, durable order events, payment and supplier reconciliation, notification delivery, verified shipment tracking, and an explicitly authorized controlled pilot before public purchasing.

The redesigned storefront and all prior draft PRs remain separate from production until an explicit release action is reviewed and verified.
