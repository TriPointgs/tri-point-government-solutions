# Automatic Icecat card images on searched products

Date: October 20, 2026. Branch feature/td-product-controls; staff-authenticated Preview only, draft PR #23. Parent commit 130463f77b00b52cb6f79002e09b5729331c5ec4.

## User feedback

The user searched Lenovo ThinkPad X1 Carbon Gen 12, manufacturer part 21KCS4S600 (TD SKU 14790211), and showed the actual image after clicking Photos & specs. This establishes that the hosted preview successfully displayed one matched product photograph via its existing server-side Icecat connector. However, the photo was not requested until the button was clicked. Product cards should load suitable images automatically rather than making a customer discover them by clicking a details action.

## Implemented controlled automatic preview

- For explicit searches and category filters, use browser IntersectionObserver to request up to two currently visible exact product records per search. A separate four automatic requests per browser tab total protects the first pilot from accidentally consuming Icecat requests while browsing many products. For the initial unfiltered full-catalog listing, no automatic Icecat calls are issued; this is deliberate for the 1,201,703-row catalog.
- When a card becomes visible, show Loading photo…, then display a product picture only if the server-validated returned brand and complete manufacturer part match exactly. The client also rechecks returned identity before replacing the card image. Otherwise display Image unavailable.
- Cache fulfilled and in-flight provider responses in a small browser Map, keyed by TD SKU, so pressing Photos & specs or repeating a search reuses an already-fetched product without an additional call. A failed call is dropped from the cache to permit later manual retry. Replaced/offscreen cards cannot receive an old result in the wrong product slot.
- Only the existing private, staff-authenticated, server-side Product JSON API endpoint returns the image (a bounded inline data URL); the browser never sees the Icecat API/content tokens, token-bearing supplier media URL or TD cost.
- The Photos & specs button remains available for full details and manual lookup of an item not automatically selected.
- No public product media is published, no bulk prefetch of 50 cards or 1.2 million records, no TD order/checkout activity, no price markup changes, no scheduled jobs, and no environment-variable changes.

This is not a general 1.2 million-product licensed content cache. A full catalog implementation would batch/index-match authorized products, store allowed image files in controlled durable storage after confirming brand/media rights, and run incremental updates within Icecat rate/entitlement terms. The pilot intentionally caps automatic calls, so not every page item gets a picture. A product with no valid Icecat image must keep an unavailable-image status rather than an unrelated generic laptop photograph.

## Verification

- Prior 635 automated Node tests preserved; final Preview and production-mode builds checked.
- Nine Playwright synthetic browser checks passed: unfiltered source page makes zero Icecat calls, exact part search automatically displays the expected card photo without pressing Photos & specs, clicking details reuses cached data, repeated search reuses data, automatic requests stay under the tab budget, the cart/checkout are unchanged, 390/768/1440 pixel responsive bounds, no external browser traffic or script errors.
- The screenshot supplied by the user proves an image appeared after a manual button click on the earlier Preview deployment; the newly implemented automatic behavior is synthetic-tested and still requires a fresh hosted search after the new deployment.
- No real supplier image access, new brand authorization, or public image license certification was performed during the synthetic test. Vercel and GitHub source state are verified separately before saying this Preview is ready.

## Next user step

Open the updated Preview shopping page, search 21KCS4S600, do not press Photos & specs, and check whether the product card replaces its placeholder with the correct photograph. If a rate limit or Image unavailable appears, share the status, rather than retrying automatically for the full source catalog.
