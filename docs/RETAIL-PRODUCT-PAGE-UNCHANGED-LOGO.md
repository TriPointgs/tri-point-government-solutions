# Retail product page — original Tri-Point logo preserved

Local business date: October 20, 2026 (build UTC October 21). Project: Different Solicitations / Tri-Point marketplace. Parent: b72023bdfab7eb05a89a615aff8976108c6549d5. Existing draft PR 23 on feature/td-product-controls; no merge or production release.

## Owner decision and constraint

The owner approved a retail product page inspired by the supplied Newegg reference and Tri-Point layout concepts, with the explicit instruction: do not change the existing logo. Preserve the actual integrated SVG assets, not any generated wordmark or logo in the visual concepts.

The screenshot/mockups are layout references, not factual business data. Invented contract-eligible/GSA-holder badges, TAA claims, sample prices, stock status, review scores, best-seller labels, financing, free gifts, guaranteed delivery dates, free-return policies, and a Tri-Point distribution-center claim are NOT implemented.

## Logo integrity

The header uses the original assets/tripoint-logo.svg on an unclipped white brand field against the navy header. No recoloring, inversion, stretching, cropping, regenerated lettering or logo redesign. All three existing assets are unchanged byte-for-byte, verified by regression test and pre-commit checks:

- assets/tripoint-logo.svg: SHA-256 7c7f1f35bf2d84b05aa5389ab319ad389305b15f6a8d17cb0c81f40183918f5d
- assets/tripoint-logo-reversed.svg: SHA-256 f69cd3b4321d75737eb53f2c609a21103e5476ce40363756d0d2e584e84d06b8
- assets/tripoint-mark.svg: SHA-256 b5011b8682174cd55aedbea0d1132248e3f17c7b4dded568240f0731b6f6f938

Other existing logo/email-signature files are excluded from the change set as well.

## Implemented experience

The Photos & specs action now opens an in-page product view rather than the earlier scrolling modal. The page has a large genuine Icecat gallery and thumbnails on the left, title/part/overview and source-derived highlights in the center, and a navy/gold buying panel on the right. Specifications and manufacturer description appear in accessible tabs below the main gallery/information area. The photograph can be enlarged in a small dedicated image dialog.

The navy header contains the existing logo, working search, category navigation and cart. Tinted feature panels and alternating specification rows add contrast without filling the page with fabricated offers. Responsive layouts support desktop, tablet and phone. Product identity is reflected in a shareable ?product=TD-SKU query, and reopening it resolves current saved/source identity server-side.

Highlights come only from supplied exact-part specification fields. The Icecat normalization limit expands from the first 20 fields to a bounded 120 so CPU, memory, storage or OS fields that appear later can be used. Absent specifications are not inferred from a similar mockup model. The full original manufacturer title and description are retained in Product details; the shorter TD catalog description remains the primary title.

## Real price and cart behavior

The new authenticated, preview-only product-offer read calls the same quote function as the cart, rather than implementing another pricing formula. It loads the product by TD SKU, uses the saved pricing policy and current read-only TD observation, preserves exact identity, production/freshness/currency validation, MAP/embargo and exclusion controls, and returns only the existing customer-safe unit price, quantity availability, timestamps and optional delivery-cost estimate.

Opening a product does not add it to a cart, persist a quote, change a product policy or submit an order. Quantity changes re-evaluate the estimate. Entering a delivery ZIP requests the existing TD freight adapter; delivery dates and free-freight promises are not invented. Add to cart calls the existing revision-checked cart implementation and rechecks the complete cart. The product-page ZIP can accompany that same add action so it need not be entered again.

The standalone product estimate may differ from a completed multi-line cart after shipping and whole-order pricing calculations. It is labeled as a private preview estimate before shipping/tax; final complete-cart validation still applies. Checkout/payment/tax/order-dispatch remain disabled.

Client caches are small, in-memory and identity/quantity/ZIP-bound. Superseded responses cannot overwrite a different product/quantity. Missing or expired supplier data stays pending. Editing the ZIP clears the former delivery estimate. Product photographs still come only from the existing exact-part, authenticated Icecat connector; no extra auto-enrichment of the entire catalog is added.

## Tests and evidence

- 664 Node 24 tests passed (previous 641 plus 23 tests covering logo byte integrity, absence of mockup claims, new price projection, unchanged MAP and stock holds, input validation, quantity/ZIP binding, read-only behavior and optional ZIP in the atomic add action).
- 20 synthetic Playwright workflow checks passed: existing logo path and no CSS transformations, source browsing, three-column full-page view, automatic price retrieval, actual-source highlight selection, gallery navigation/zoom, keyboard tabs, price/ZIP updates, invalid ZIP handling, one atomic cart addition, out-of-stock state, working category buttons, deep-link reload, late response isolation, five responsive widths, no secrets/cost leakage, session expiry, and no external browser traffic.
- Preview and production-mode builds are run before commit; production route gates and the main branch remain unchanged.
- Review feedback prompted additional safeguards against stale/invalid-ZIP response display, expired-price stock claims, and rejected cart-add promises. Existing successful unit/browser suites were rerun afterward.
- Browser test supplier data, inventory, imagery and prices were synthetic. No real TD/Icecat calls, hosted carts, payments or supplier purchases were made by those tests. Hosted authenticated rendering and the first real product-offer request still need owner verification after deployment.
- Screenshots were exported for review, but transfer into the local visual inspection container failed; no claim of a manual pixel-by-pixel visual inspection is made. Automated five-width layout and interaction checks did pass.

## Preserved / next

No logo changes, credential changes, database migration, paid subscription, public marketing claims, production merge, real checkout, email delivery or supplier ordering. Next owner check: open the updated private shop, search a part, select Photos & specs, and verify the current product page while retaining the same logo. A product with zero stock must show unavailable rather than the in-stock sample from the mockup. Public release and live order management remain separate authorized milestones.
