# Tri-Point Equipment Store — Controlled Release

## Phase 1: equipment RFQ storefront

The /equipment route offers generic sourcing categories and a mailto-only equipment RFQ composer. Buyers must review and **send** the prepared email; no buyer data is submitted to the server or saved in the browser. No live catalog, availability, checkout, procurement feeds, payment collection, or claims of distributorship for particular products have been enabled. Existing contractor network, agency homepage and staff Opportunities workspace are not replaced.

## Phase 2: staff-only preliminary pricing foundation

The /equipment/admin route presents a draft quote calculator. It calls POST /api/equipment-admin, which uses the **existing administrator session** and same-origin validation. No other user, including an anonymous visitor or contractor profile applicant, has server access. The API is read-only/in-memory: it does not store supplier records, send email, place orders, call TD SYNNEX, or initiate any payment.

The pure model at lib/equipment-pricing.mjs accepts normalized SKU/MPN data. It is **not** an unverified parser for TD SYNNEX flat file layouts. Source mappings remain to be implemented after obtaining an actual customer-specific sample file and the confirmed record layout for that account.

Quote math uses integer cents:
- Landed cost = supplier unit cost × quantity + total inbound/outbound freight allowances + known additional landed fees.
- Quoted total is the highest of the proposed markup-based price, requested minimum gross margin price, and minimum total dollar profit, rounded up to whole unit selling prices.
- Estimated gross profit = proposed sale total minus landed cost.
- Taxes and unentered payment processing, financing, return, and other business costs are excluded. Re-evaluate before any formal quote.
- Markup on cost is *not* the same as gross margin on revenue.

SKU matching requires exact normalized TD SYNNEX SKU or manufacturer part number. No loose keyword match is called a guaranteed equivalent. Part-number-only matches require SKU confirmation, manufacturer mismatches are flagged, and readiness requires active product, confirmed reseller authorization, current price, sufficient stock, and a fresh timestamp. Buyer-specific EDUCATION, FEDERALGOVERNMENT, STATEGOVERNMENT, PROMOTION and HEALTHCARE pricing must not be assumed available to every buyer. Staff still review scope, compliance, warranty, manufacturer rules, delivery and profitability.

## TD SYNNEX connection gates

API testing established that a **real sandbox API key** reaches the Price and Availability service but returned the business error `ValidateCustomerExists` for customer number 822539. This is unresolved until TD SYNNEX confirms correct customer-to-developer-account provisioning. Do not attempt live purchase order submission.

Original OAuth attempt returned `invalid_client`; validate sandbox token environment and client ID separately.

The documented Price/Availability API checks up to 100 known SKUs per call; it is not by itself a searchable whole-catalog feed. TD SYNNEX separately publishes eCatalog Price & Availability Flat File and hourly inventory file specifications. Those are *formats*, not proof that our account has provisioned delivery. Request account-specific data feed access, sample file, permitted product-display rights, manufacturer authorization rules, pricing/stock update frequency, and approved delivery channel from the TD SYNNEX B2B team.

DO NOT commit client IDs with secrets, sandbox/prod API keys, OAuth bearer tokens, wholesale prices, customer-specific files, lead contact records, or customer financial data to this public repository. Place approved secrets only in encrypted server-side environment variables; never expose to browser bundles. Keep production order submission and unsupervised outreach disabled.

## Review and release gates

1. Node 24: `npm ci`, `npm run test`, `npm run build`.
2. Open preview `/equipment`, verify categories, no fabricated live stock, RFQ form validation, mailto-only behavior, and accessibility.
3. Sign in using the current administrator login and open preview `/equipment/admin`. Verify anonymous API calls return 401, signed-in estimates calculate correctly, POST from untrusted origin fails, no prices in the public HTML, and no stored records.
4. Verify existing contractor intake, private opportunity storage, no-source-disclosure boundary, and sitemap/regression tests.
5. Confirm preview `/equipment/admin` is noindex and private/no-store; production unchanged.
6. Before merging: preserve the main commit as rollback reference. No production deployment until manual review passes.

## Later sections

- Phase 3: securely obtain and parse real TD SYNNEX eCatalog + hourly inventory feeds with an explicit versioned field mapping, change detection, stop-sale policy for stale/discontinued/unapproved items, private storage and error monitoring.
- Phase 4: private lead/opportunity product-match intake in the existing Opportunity Bot; save raw solicitation references, deadlines, manufacturer requirements, authorized equivalents and comprehensive bid/no-bid review. No external scraping contrary to access rules.
- Phase 5: buyer-facing quote-request persistence (privacy policy, consent, protections, abuse controls, retention), approval workflow and supplier live-cost checks.
- Phase 6: payments, invoice matching and fulfillment only after verified TD SYNNEX access, approved reseller terms and explicit permission for order automation.

## Phase 3 development: synthetic feed staging (October 12, 2026)

A new **synthetic-only catalog and stock importer** now exists in `lib/equipment-catalog-stage.mjs` and `api/equipment-import.js`. The private preview page `/equipment/admin/import` loads harmless example CSV and returns read-only validation results. The import API requires the existing administrator session and same-origin request. The endpoint returns HTTP 404 in production, even when signed in. It **never persists or publishes records**, does not contact TD SYNNEX, and cannot submit orders.

- Supported catalog version: `TP_SYNTHETIC_CATALOG_CSV_V1` with exact columns `sku,mfgPN,manufacturer,description,category,status,priceType,unitCost`.
- Supported stock version: `TP_SYNTHETIC_HOURLY_STOCK_CSV_V1` with exact columns `sku,quantity,stockAt`.
- Synthetic SKUs must begin with `SYN-`. Real distributor SKUs and unknown layouts are intentionally rejected.
- Max 128 KiB and 250 records per feed; duplicate SKU/price type, malformed CSV quoting, invalid prices, invalid timestamps and unexpected headers fail closed.
- Full stock snapshots must cover every staged SKU; explicitly requested delta updates can update only known SKUs. Out-of-order timestamps and conflicting replay payloads are rejected.
- A stock refresh cannot turn a product into sale-ready stock: `authorized=false`, `checkedAt=null`, `source=SYNTHETIC_ONLY` remain enforced. Responses expose counts and checksums, not wholesale unit costs or raw rows.
- Test fixtures live under `tests/fixtures/`, outside the public build assets. `tests/equipment-catalog-stage.test.mjs` checks all-or-nothing validation, idempotent replay, duplicate rejection, stock stale-order rules, and authentication restrictions.

**Not implemented or claimed:** TD SYNNEX production v4.7 flat-file field mapping, actual catalog download access, vendor image/description license, database persistence, production inventory refresh, public SKU listings, payment or order submission. Real vendor source documents must first be reconciled against an account-specific sample and authorized data-delivery agreement. The synthetic CSV layouts above are Tri-Point test schemas, not a representation of the distributor's flat-file record structures.

Before turning on real imports, design dedicated private durable storage with transactional snapshot/promote semantics, checksum/idempotency, retention and recovery, source provenance, change alerts for SKU deletion and price increases, and a strict public projection. Verify import idempotency against a customer-provisioned TD SYNNEX sample; keep all real costs and vendor credentials outside source control.

### Synthetic change-control review (development only)

The import dry-run now optionally accepts a **previous synthetic catalog CSV** to compare against the proposed catalog. It computes SHA-256 fingerprints and shows new/removed/modified SKUs, unit-price changes (counts only), product-status changes and the fraction of existing records affected. A default policy flags removals over 20% or changed/removal entries over 60% as hard stops. Even when no hard stop is detected, **all actual changes require manual review**; no dry run can auto-publish or authorize a supplier product. The UI's **Load synthetic example** button populates both old and proposed catalogs for a reproducible zero-change test. Editing a proposed synthetic price or removing a row demonstrates the review gates.

The comparison takes place only in the current authenticated preview request. It is not an inventory-history database, not a supplier-sync task, not a persistent approval workflow and not a production mapping for the TD SYNNEX file layouts. Reports deliberately omit raw costs and confidential supplier rows. Once real catalog access is provisioned, a new versioned decoder and controlled private storage/reconciliation process will be designed and separately reviewed.
