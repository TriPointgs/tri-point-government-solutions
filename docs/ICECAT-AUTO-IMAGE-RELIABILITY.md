# Icecat automatic image reliability fix — October 20, 2026

Branch: feature/td-product-controls. Internal Preview only; no live checkout or catalog publish action.

## Actual problem

The user tested a real Lenovo ThinkPad X1 Carbon Gen 12 (part 21KCS4S600) after an earlier manual Photos & specs lookup successfully displayed a real matching product image. The new automatic image preview still showed the generic laptop icon. A code inspection found the client was limited to **four automatic lookups per browser tab**, permanently, without a visible explanation. After four previous candidate attempts (including unrelated searches or unavailable results), all later searched items were skipped. It also required an IntersectionObserver callback for every lookup, even a single exact-part search.

The screenshot proves only that the photo was absent on the card; it does not independently prove how many Icecat requests the user's browser had consumed or whether a provider response was rate-limited.

## Changes

- Remove the silent four-requests-ever per-tab cutoff. The server still rate-limits Icecat requests, and the client continues to restrict auto-lookups to two candidate products per individual search, plus a small per-tab cache of already-fetched results.
- Give **exact full manufacturer part or TD SKU matches priority**, performing the lookup immediately rather than waiting for IntersectionObserver. A search with an exact match does **not** spend a second provider request enriching irrelevant prefix matches on the same results page.
- Keep lazy loading of up to two currently visible candidates on less-specific searches and category filters. Opening the initial unfiltered 50-product catalog page still makes zero Icecat calls.
- Repeated searches for the same SKU reuse the already-fetched photograph, and the Photos & specs detail button reuses the cached content instead of requesting it again.
- If the API rate limit is reached, display Photo lookup paused rather than leaving the original generic icon indefinitely. When an exact matching photograph is unavailable, show Image unavailable. Product identity must continue to match exactly; no cross-SKU fallback photography.
- No account settings, Icecat credentials, TD feed, product publish status, price/markup rules, checkout, payments, or supplier orders are changed. The entire change is limited to frontend preview behavior.

## Verification

- 635 Node 24 automated tests passed on the original suite, with zero failures.
- 10 local synthetic Playwright browser checks passed, including:
  - initial unfiltered 50-product browse without provider lookups;
  - exact-part search loading the image before clicking Photos & specs, even with prefix matches present;
  - only one Icecat lookup for an exact result;
  - six consecutive distinct exact-part searches still receiving images, exceeding the old four-attempt limit;
  - opening product details and repeating searches without extra requests;
  - exact result auto-loading when IntersectionObserver is unavailable;
  - responsive 390/768/1440-pixel layout, staff access, private supplier data and disabled checkout.
- These checks used synthetic product content only; the updated hosted preview still needs a real Lenovo search after deployment.
- Public image usage rights, persistent image storage and wholesale enrichment of 1.2 million supplier records remain separate tasks. A full production catalog cannot rely on unlimited real-time requests per item.
