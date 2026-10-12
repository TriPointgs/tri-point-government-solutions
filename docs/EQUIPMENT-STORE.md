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
