# Icecat Product JSON — multi-photo gallery preview

Date: October 20, 2026. Parent commit 8cbc4b57ff6f23f2ddc3682eb4e21ef52954a20f. Draft PR #23, branch feature/td-product-controls.

## User need

The user demonstrated an actual Lenovo ThinkPad X1 Carbon Gen 12, MPN 21KCS4S600, with a correct single product image and long scrolling technical description. They requested a better layout and more photographs. The first Icecat connector deliberately fetched only one image from the gallery. No image or data for another Lenovo configuration may be substituted.

## Implemented

- On the admin-only shop preview, Photos & specs now opens a spacious, image-first details panel, with a larger product photograph, horizontal thumbnail strip, an image count (for example, 1 of 3 photos), previous/next arrows and keyboard-focusable thumbnail selection.
- A concise product overview is shown immediately; the full long description is tucked into Read full description. Specifications are a separate expandable technical section with field/value rows. Both desktop and mobile layouts are responsive.
- The Icecat server adapter now accepts two explicit modes: cover for ordinary searched product cards and gallery only when a staff member opens details. It reads up to five genuinely distinct Icecat Gallery product entries, preferring 500px photos in the modal, with authorized low-resolution fallback where needed. It filters brand logos/packaging, rejects unknown hosts/protocols, checks exact manufacturer and complete MPN, MIME and image magic bytes, limits each downloaded image to 400KB (gallery) or 220KB (cover), and deduplicates downloaded images by SHA-256 content.
- Only the server contacts Icecat and retrieves token-bearing source media. The browser receives validated bounded inline image bytes, never the API token, content token or original media URLs. Staff-only preview access and per-IP 15-minute request limits remain.
- Cover and full-gallery requests are cached separately in the browser by supplier SKU, brand and full manufacturer part number. Reloading details for the same product uses the already fetched gallery; automatic card enrichment still fetches only a cover.
- If Icecat returns just one verified photo, the interface correctly shows one; there is no invented secondary photo. If every photo fails validation, the panel says Image unavailable and product.hasImage=false.
- All original TD pricing, product eligibility, shipping, smart pricing, MSRP/MAP review, live production, checkout and supplier ordering rules remain unchanged.

## Verification

- Local build under Node 24: 641 tests passed, 0 failed (previous 635 plus six new Icecat gallery/identity/image tests).
- Eleven synthetic browser checks passed: exact product card automatic cover, explicit gallery returning three genuinely different fixture photos, thumbs/arrows and aria-pressed state, shorter overview plus expandable full copy, reusing gallery without another request, phone/tablet/desktop layout, disabled checkout, protected data and staff-only access.
- Production-mode and Preview builds compiled successfully; the updated hosted Preview deployment is verified separately before reporting Ready. Local test images are synthetic. The real Lenovo Icecat gallery-photo count is unknown until the owner reopens Photos & specs on the new hosted preview.
- No new Icecat subscription/rights were requested, no raw media/source token committed, and no full-catalog enrichment or public image publication was performed.

## Next

Have the user open Photos & specs for Lenovo 21KCS4S600 in the new preview. Confirm the returned count and actual distinct thumbnails. If the Icecat account provides only one authorized product image, investigate additional authorized manufacturer/Lenovo gallery assets or broader Icecat entitlements rather than fabricate views. After successful tests and rights review, plan durable image storage and incremental enrichment for the wider TD catalog.
