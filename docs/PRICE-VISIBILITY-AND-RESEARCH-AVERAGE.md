# Product Control Center: visible TD amounts and saved research averages

Date: October 20, 2026. Review branch only; no public release or commerce activation.

## Problem reported and diagnosis

The administrator saw a TD acquisition amount in small supplier text but no suggested price or retail average. The root causes were separate:

1. The comparison modal returned `tdCost` only while the supplier observation was fresh. An expired observation was hidden instead of shown as historical.
2. The approved selling-price calculation intentionally requires confirmed USD, fresh production evidence and resale review. Using that same field as the only internal markup display made normal research look empty.
3. SerpApi candidates were not saved to the product workspace or its private comparison book. Closing/reloading a comparison therefore retained zero reviewed offers despite successful research.
4. The original average is an in-stock, reviewed-offer benchmark. It is not the requested descriptive average across all usable exact-part search prices.

## Implemented distinction

### TD amount and internal calculation

`internalPriceContext` exposes the last matched TD price observation and time to administrators even after freshness expires. It labels the observation as recent/expired, retains its source environment, flags unconfirmed currency, and distinguishes last reported quantity from current stock. A failed latest refresh may retain the prior successful observation for historical display, but it does not revive a current quote or current stock.

The internal markup estimate uses the existing default 15% and the exact same category/manufacturer/product override precedence and cent rounding. Its output is explicitly indicative, internal-only, in the same confirmed or unconfirmed currency as TD, and not an approved selling price. Existing `calculateMarketplacePrice` validation, resale checks, current stock filters, customer projections and checkout gates remain intact. The header says **Internal markup estimate**, not an approved customer price.

### Research average across usable prices found

A new private per-product record under `preview/product-research/` retains the latest normalized result for each search mode. It contains only bounded allowlisted research fields, not raw provider responses or secrets. No migration or rewrite of existing retailer approvals, catalog sources, orders or contractor records is performed.

The report shows a research mean, median, price range, price-bearing source count, exact-source groups, total returned listings, missing-price count, source rows, stock indications and retrieval times. Missing prices never become zero. Duplicate source groups count once. Conflicting prices from the same source at the same timestamp are held rather than arbitrarily chosen. A successful empty newer run replaces the old same-mode result. Failed lookups do not erase or falsely refresh the existing report.

This is a descriptive **unverified search-price benchmark**. It can include backorders, supplied-to-order offers and unknown inventory, since those prices still provide internal research context. It excludes wrong parts, explicit used/refurbished offers, conditional/installment prices, unusable price amounts, explicit foreign currencies and ambiguous multi-seller pricing. A dollar symbol alone is not proof of USD; the interface plainly states that USD is assumed for dollar-only research quotes and actual currency/country is not confirmed. It is never labeled a verified in-stock average.

The historical reviewed in-stock comparison remains a separate section and keeps its original criteria. Public product projection still excludes distributor costs, internal markup calculations and research reports. No market benchmark changes customer prices, manufacturer MAP requirements or fulfillment authorization.

## Persistence and credit control

- Search, normalize, validate product identity, then save a report. Search results can now update the main saved-product row and survive closing the modal, reloading the list, or revisiting the page.
- Reading saved reports never calls SerpApi. No recurring refresh or paid-plan change is created.
- Concurrent writes use compare-and-swap. A storage retry never repeats a billable provider request. If persistence fails after search, the response explicitly says the report is temporary; it never falsely claims the search was saved.
- Newer-started research cannot be overwritten by an older request that completes late. Ambiguous simultaneous runs retain the existing report and report that disposition honestly.
- Exact-part results previously returned before this feature were not stored and cannot be reconstructed from the screenshot by a code deployment. One new administrator-triggered search is needed to create the first live saved report. No historic amounts are seeded into hosted data.
- The existing 24-hour research freshness limit is evaluated when read. When all saved reports expire, they remain visible as expired history, not current prices. The source fetch time does not prove a retailer's search-index price is live at checkout.

## Additional parser corrections

Price hints now explicitly classify dollar-only versus explicit USD currency evidence and reject explicit CAD/AUD/NZD/GBP/EUR and other foreign-currency indicators. Conditional price language is rejected, sub-dollar amounts retain correct cents, and sentence punctuation cannot truncate a comma-formatted price. Only server-normalized research can populate the report; there is no arbitrary client-supplied research import action.

## Verification and release scope

- All existing 462 tests retained; 30 additional internal-price, research arithmetic, persistence, staleness, currency, identity and race-condition tests: 492 total.
- Twelve local browser workflow checks cover the last-known cost, currency-unconfirmed internal estimate, one-search report persistence, main-row update, reload without another provider call, separation from reviewed offers, customer isolation, responsive layout and session expiry.
- Synthetic fixtures and in-memory repositories only; no real provider requests or hosted product mutation during tests.
- Independent code review identified an ambiguous timestamp overwrite/false-save edge case; the fix is regression tested.
- Both preview and production-mode builds tested; production routes continue to deny the private product-control functionality in this staged release. No secrets, production configuration, public storefront, payment, email or supplier ordering were changed.

Reference for the returned provider fields: official SerpApi organic results documentation at https://serpapi.com/organic-results and shopping results documentation at https://serpapi.com/shopping-results (reviewed October 20, 2026). Search results do not guarantee a numeric price for every retailer; no price is invented for a source without usable data.
