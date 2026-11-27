# Tri-Point marketplace — launch preparation, October 21, 2026

## Scope and fixed design

The owner approved the retail product-page design and original logo, then authorized work to make the marketplace market-ready, including SEO and order readiness. This release preserves that design and every existing logo asset. It is a private preparation release on feature/td-product-controls / draft PR 23, not a claim that live checkout or the public store is ready.

Starting feature SHA: 462abe206571c33ab3cab15421a0fb037378e58f. Starting main SHA: 1e808fb320c616cff44ab47a224f465d9651fe3e. Reconcile with current main before any eventual production merge; the review branch is not automatically a replacement for newer production content.

## What was actually verified before implementation

- GitHub feature/main references and the exact READY prior preview deployment were read from the connected services.
- Vercel environment-variable **names, type, targets and branch scopes only** were inspected with decrypt=false. No values were exposed. TD read-only production pricing/freight and Icecat are configured on this Preview branch. No marketplace payment-provider credentials were found. This does not prove the business has no external payment account.
- Resend's connected domain list confirms send.tripointgs.com is verified with sending enabled. Marketplace order-email sending is not configured/tested in this preview; domain verification alone is not delivery evidence.
- Stripe and Google Search Console connections were not active in the inspected connector workspace. No service was connected, paid plan purchased, or another company's account reused.
- Live, read-only public HTTP checks returned 200 for robots.txt and sitemap.xml, with the public sitemap currently listing corporate/partner/blog pages. The public /marketplace returned 404. Public privacy and terms pages identify themselves as contractor-network policies, not online-purchase terms. No production files were changed by this audit.
- The supplied TD OpenAPI file, openapi (2).json, includes SubmitPO, GetOrderStatus and GetPOStatus. The installed TD adapter still implements only GetPriceAvailability and GetFreightQuote. A method existing in documentation is not evidence that ordering or tracking has been wired or tested.

## Implemented now

### Search-engine foundations

Clean URLs:
- /shop-preview/product/{TD-SKU}/{brand-and-exact-part-slug}
- /shop-preview/category/{supported-category}

Product links and category links use ordinary anchors, not only JavaScript buttons or a search box. Product routes return the product title, manufacturer and complete MPN in the initial HTML. When permitted exact-part content is already cached, that HTML also contains the description, photo and technical attributes before browser JavaScript runs. The approved interactive page hydrates afterward.

Each product has a unique title, description, canonical, Open Graph and Twitter metadata, plus Product, BreadcrumbList and Organization JSON-LD. All source text and JSON are escaped. A narrow page-specific CSP hash authorizes the JSON-LD block; browser API/content credentials are never embedded. A wrong product slug redirects to its canonical private path. A single main heading reflects the active product. Category pages return initial HTML links to real source records.

All preview pages remain staff-authenticated, noindex and private/no-store. No preview sitemap, merchant feed or URL was submitted to Google. The public Offer-schema builder is fail-closed: it requires explicit publication/indexability, resale and content rights, known non-embargo status, approved pricing, operational checkout, exact identity, current confirmed USD price and known stock state. No ratings, reviews, GSA/TAA badges, delivery dates or policies are invented.

A publication-filtered sitemap generator and sitemap index are implemented for the later release. It defaults OFF, includes only explicitly approved canonical public product records, deduplicates links and splits below 50,000 URLs / 50MB per file. Lastmod uses the actual recorded publication update, not today's date on every run. It has not been attached to the live sitemap or populated with all 1.2 million imported records.

These are tested technical SEO foundations, not a guarantee of rankings or rich-result eligibility. Public indexability, licensed publicly hosted images, feed enrollment and Search Console ownership still require launch work.

### Product-content reuse and performance

A six-hour private cache stores the normalized exact manufacturer/MPN content and bounded image bytes in a separate preview/licensed-product-content/v1 namespace. API/content tokens and original token-bearing Icecat URLs are stripped. Cache keys include the product identity, media mode and a non-displayed token fingerprint, so changing the content account does not reuse another account's assets. Cache entries are scoped to private preview use, never treated as public content approval.

A gallery cache can supply its cover image. Repeated reads across browser sessions and concurrent identical requests can reuse the content; cached reads do not consume the per-provider lookup limit. Expired entries require a fresh lookup. Explicit access/identity refusal invalidates both media modes. A storage failure reports not-stored rather than pretending persistence succeeded. Expiry governs serving; it is not an automatic deletion/retention policy.

This does not bulk-import Icecat content, create a daily refresh job, make the Windows catalog always-on, or publish media files to a public CDN. The owner's PC/gateway remains a launch dependency.

### Checkout review, without a premature purchase

The existing cart now offers Review checkout in the private preview. It collects ordinary contact and US delivery details, never card numbers, distributor costs, weights, MAP inputs or pricing worksheets. Consent expressly describes a private test review, not accepted purchase terms or a marketing opt-in.

The server rechecks price, requested stock and freight using the existing TD quote logic and reviewed cart revision. It preserves product/MAP/embargo and profit-profile holds. The resulting immutable review is stored in private Blob under the signed cart owner and request UUID, not the public repository. A repeated identical request returns the original review; changed payloads under the same reference are rejected. Another cart cannot read the record by guessing its ID. A discard action deletes the review and leaves the cart intact.

Draft responses contain customer-safe line/price data and explicit holds. Tax remains null, never a guessed zero. Final payable total remains null. The review expires after 15 minutes and then no longer shows old prices/stock as current. It never authorizes/captures a payment, reserves inventory, sends a PO, sends email, or becomes a real order. Staff-only access remains; public buyer authentication and live order history are not released.

### Launch operations and email copy

/admin/launch evaluates the current review workspace/configuration and separates implemented, configured, partial and blocked items. It does not report success just because a key exists, and it always reports publicLaunchReady=false in this release. It reports only the saved review pool, not a claim that the million-row source catalog is approved.

Branded HTML/plain-text received, authorization, shipment and hold email templates have been prepared. Authorization and shipment templates require corresponding evidence; sample previews are clearly labeled unsent synthetic examples. They are not connected to a production order outbox/dispatcher yet. No customer/internal email was sent.

## Remaining launch blockers — not misrepresented as finished

1. A Tri-Point-owned payment processor and hosted checkout/webhook integration, verified test-mode payments, payment-method/authorization/capture/refund rules, fraud controls and reconciliation. No payment adapter was silently activated in this release.
2. Tax registration/sourcing configuration, product tax treatment and an exemption-document review process; current network privacy/terms must be replaced or supplemented by approved online-purchase/privacy/returns/cancellation/shipping/warranty policies.
3. Durable real-order/customer-access infrastructure, the documented TD PO submission/status adapters, unique PO dispatch/reconciliation, partial shipments, cancellation/refund handling, and order-triggered email delivery. Existing order-lab simulations remain simulations.
4. Product public-content/resale/condition/MAP approval, licensed public image hosting, an initial eligible assortment, and always-on current catalog hosting/refresh/monitoring. The full source feed is not public-sale authorization.
5. Reconcile with current production code; run the real-data prelaunch scenario, public SEO/rich-result checks, security/accessibility/performance verification, and rollback test. Then explicitly approve public deploy and indexing, connect Search Console/Merchant Center, and submit verified feeds.

## Verification and limitations

702 automated Node 24 tests passed at the final test milestone (previous 664 plus 38 launch/SEO/cache/checkout cases). Twenty isolated browser workflow checks passed: clean routes and crawlable anchors, cached initial HTML with JavaScript disabled, canonical redirect, preserved design/logo, real fixture price/cart, privacy/CSRF/session boundaries, normal checkout form, private scope/idempotency/discard, unsent template copy, and responsive phone/tablet/desktop layout.

All order/contact/media fixtures were synthetic; no real TD price/PO calls, payment requests, customer emails or hosted cart mutations were used in those tests. Hosted first-use cache writes and real checkout-review persistence still require a signed-in user test. Tests are evidence of the stated coverage, not proof of a complete commerce launch.

Independent review identified missing explicit indexability/embargo checks and malformed/over-age cache cases. These were fixed and regression-tested. The initial browser test exposed a local-fixture canonical-origin mismatch; the fixture now declares its test environment and the full suite passed afterward. The original logo hashes remain unchanged.

Rendered screenshots were generated locally, but transferring the new screenshot into the visual-inspection environment was blocked by the download tool. No pixel-by-pixel visual-inspection claim is made. Layout bounds and interaction tests did pass.

## Official references reviewed

- Google initial-HTML Product guidance: https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- Google crawlable ecommerce navigation: https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure
- Sitemap limits and canonical URLs: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Icecat Product JSON, matching and self-hosted permitted media: https://iceclog.com/manual-for-icecat-json-product-requests/
- Stripe separate authorization/capture: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- Stripe Tax checkout prerequisites: https://docs.stripe.com/tax/checkout
- Resend idempotency's 24-hour provider window: https://resend.com/changelog/idempotency-keys

No ranking guarantee, public publication, live purchase, scheduled ingestion, tax compliance certification, legal-policy approval, or successful email delivery is claimed.
