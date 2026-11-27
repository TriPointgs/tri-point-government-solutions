# Icecat Product JSON content pilot — October 20, 2026

Private review branch feature/td-product-controls, draft PR 23. No production storefront changes or purchases.

## Connected credentials

Vercel key metadata confirms Sensitive TP_ICECAT_API_TOKEN and TP_ICECAT_CONTENT_TOKEN entries specific to this Preview branch. It also reveals two Preview-wide duplicates, which should be deleted only after the branch-specific API test succeeds. No credential values were decrypted or included in any code or browser output.

Official Icecat Product JSON manual: https://iceclog.com/manual-for-icecat-json-product-requests/ (version 3, updated 2026-10-13).

This uses GET https://live.icecat.biz/api with both credentials in server-only request headers named api-token and content-token, and lang=EN, Brand and ProductCode query fields. A Channel Partner account and product-brand permissions are required. Open Icecat access is limited; unauthorized brand content is not a missing photo or a broken TD import.

## Current private product-details experience

On the staff-only shop preview, search a product and click Photos & specs. The server resolves the exact SKU from the private TD catalog and sends the original manufacturer and complete manufacturer part number to Icecat. It compares both returned identities exactly before accepting the response. The dialog displays a plain-text description, a small set of specifications, and an image when the permitted Product JSON response includes a recognized real product photograph.

The image is fetched server-side only from HTTPS images.icecat.biz or data.icecat.biz, without redirects, with a 220KB size cap, MIME and magic-byte checks. It is then displayed only as an inline image in the private staff session, with no content-token-bearing media URL sent to the browser. Brand-logo-only galleries do not masquerade as product photographs.

There is no background query for each catalog product and no automatic import of 1.2 million Icecat records. A manually triggered individual lookup is intentionally used for the first real permissions/coverage test; the public storefront remains unchanged. Missing images display Image unavailable.

## Validation

635 Node 24 automated tests passed, including 24 Icecat connector tests for exact identity, response handling, private image transport, quota, staff authentication and no public access. Eight local Playwright checks passed using synthetic products and images. Both preview and production-mode builds were executed; hosted readiness is verified separately. No real Icecat request was used in local tests, and no merchant credentials, public prices or supplier orders were modified.

## Follow-up

Test Lenovo 21KCS4S600 by clicking Photos & specs in the updated preview. If an entitlement error appears, verify MyIcecat Channel Partner and brand authorization, rather than adding new credentials blindly. After one successful match, evaluate exact-SKU coverage for Lenovo, Fortinet and Microsoft hardware; Zoom is a software service and does not require hardware packshot images.

For wider catalog enrichment, use Icecat personal index files for match discovery and store permitted media in controlled storage with license checks and incremental updates. Icecat recommends not using its token-bearing source URLs directly as permanent site image hosts. Exact identity and rights remain required. Pricing, stock and freight always come from TD.
