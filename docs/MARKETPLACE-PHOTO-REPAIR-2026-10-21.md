# Marketplace product-photo repair — October 21, 2026

## Request and evidence

The owner reported that no items were showing images after the launch-preparation preview. Baseline feature commit: f574d06dacf8e94c841c4ed9b301cedbbe61d072. Work stays on feature/td-product-controls / existing draft PR 23. The approved layout and original logo are unchanged.

A local browser reproduction used the actual baseline frontend and the existing synthetic source with usable photos for every test SKU:
- Initial catalog: 50 cards, **0 content requests, 0 photographs**.
- Broad search plus scrolling: **2 content requests, 2 photographs**, regardless of more visible matching products.

This was an application scheduling defect: the page intentionally skipped images without an explicit search/filter and had a two-images-per-search cutoff. The server separately imposed five uncached content reads per IP per 15-minute window, so modest browsing could also stop new image retrieval. A matched product whose image download temporarily failed could be cached as an empty photo result for six hours, and an empty cover cache could hide a later usable gallery.

These findings are code-level and reproduced local behavior. The user's originating signed-in browser was unavailable to the connected browser tool. The scoped Vercel runtime-log queries returned no entries; that is not evidence of error-free live requests. Both Icecat variable names and Preview branch scopes were confirmed with decryption disabled. No keys were reset or changed.

## Fix

- Load photographs automatically for visible product cards on normal catalog, category and search pages, without requiring a search or Photos & specs click. Images are fetched at most **two concurrently**, not two in total. Offscreen products wait; scrolling makes them eligible. A fallback handles browsers without IntersectionObserver.
- Preserve exact manufacturer and complete-part matching. Outdated results cannot paint a different product/card after navigation. No unrelated image, fabricated photograph or generic laptop drawing is substituted for a missing source image.
- Reuse successful cached photos. Gallery success also supplies the matching cover. Return-to-results restores automatic loading without issuing duplicate requests for already cached content.
- Separate temporary download failures from a confirmed no-photo response. Transient failures are not persisted as a six-hour absence. Older ambiguous empty cache entries are rechecked. Confirmed no-photo results get a two-minute retry interval; successful images retain the existing six-hour server cache. A larger image for the same gallery entry can be tried when its low-resolution version fails.
- Show a clear, safe state: loading, no supplied photo, account-specific photo access, temporarily unavailable, or request limit paused. A retry button is available for temporary failures. HTTP 429 includes Retry-After, and the queue waits rather than spinning or calling a pause permanent photo absence.
- Replace the image-only five-per-window limiter with a bounded, atomic preview request budget: **60 uncached provider lookups per account per 15 minutes**, **240 content reads per IP per 15 minutes**. These are application safeguards, not assertions about Icecat subscription limits. Cached photos bypass the upstream budget. The normal cart/login/API limits are untouched. No paid plan or quota purchase is made.
- Budget counters use @vercel/blob 2.8.0 conditional ETag writes. One counter per scope is reused across windows rather than adding a new per-window object indefinitely. Concurrent updates retry only bounded conflicts; unavailable budget storage fails safely rather than permitting unlimited requests.

The provider still decides which exact products have accessible images. This change does not create missing photos, give new manufacturer permissions, bulk-enrich the million-row catalog, publish private content, or guarantee a photograph for every imported product.

## Verification

- **724 Node 24 automated tests passed**: prior 702 retained, 22 new image/queue/cache/budget/API cases.
- **14 image-specific browser workflows passed**, checking actual image decoding/natural width (not just an img tag), initial browse, scrolling beyond two photos, two-request concurrency, unseen cards, exact product search, unchanged gallery/logo/layout, cache reuse, temporary failure retry, Retry-After handling, category pages and anonymous denial.
- **20 existing launch/checkout browser workflows passed** as regression coverage, including clean product URLs, server HTML/cached content, consented checkout reviews, cart ownership, replay/discard behavior, no real payment/order dispatch, and responsive layout.
- All browser/provider test data was synthetic; no TD orders, payments, customer emails, real supplier calls or hosted customer records were created by those tests.
- Independent review raised a concern that ifMatch was unsupported. The installed @vercel/blob 2.8.0 type definition and actual implementation explicitly support ifMatch and send x-if-match; that specific concern did not apply to the pinned version. Its per-window storage-growth concern led to stable reusable counters and a rollover regression test.
- Preview and production-mode build gates pass before commit. Original logo files are byte-compared to the baseline. No production merge, environment change, supplier/public-catalog change or pricing change occurs.

## Next live check

Refresh the current review-branch shop. Product cards should begin showing available matching images as they come into view without a special search or button click. If a specific product still cannot return a photo, the visible label distinguishes unavailable source media from a temporary pause. The known Lenovo part 21KCS4S600 remains a useful comparison because the owner previously demonstrated its five-photo gallery.

Official content contract reviewed: https://iceclog.com/manual-for-icecat-json-product-requests/ (Product JSON, gallery entries, exact product identification and server-only media credentials). Actual live image availability/entitlement is not established by synthetic fixtures or a READY deployment.
