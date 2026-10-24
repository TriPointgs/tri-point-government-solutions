# Checkout review reliability — October 21, 2026

Scope: Tri-Point marketplace / Different Solicitations. Existing review branch feature/td-product-controls and draft PR #23. Starting source: e9d5173102ae017465b9e5f000f332b97c1049b8. The owner asked to continue the website work directly rather than hand the review to Claude.

## Reproduced defects, not assumptions

A controlled baseline run using the existing service and synthetic suppliers demonstrated:

1. Discard deleted the review file. Replaying the original prepare request then recreated that same review and stored the contact information again.
2. A saved review for quantity 2 continued to display the old $230 synthetic subtotal after the cart was changed to quantity 4.
3. A malformed expiry timestamp was treated as non-expired and left the prior price visible.
4. A two-minute provider delay extended the review deadline from 14:15 to 14:17 because expiry was restarted when saving instead of inherited from the original quote.
5. Simultaneous identical prepare requests both queried the supplier, although the final immutable review reference was the same.

These were defects in the private review workflow. No real order, payment, email or inventory reservation occurred in reproduction or repair testing.

## Implemented correction

### Durable request lifecycle

Each signed-cart/request reference now has a private preparation claim before pricing begins. Concurrent attempts to use the same request reference must either wait or recover the completed result, rather than repeat the supplier check. The implementation uses the pinned @vercel/blob 2.8.0 origin read, ETag and conditional-write primitives, not a process-local lock. The in-memory test adapter follows the same lifecycle.

States are preparing, prepared, failed and discarded. Claim/control records contain no contact/address fields. Preparing requests that do not finish within the recovery window require an explicit discard/restart; they are not silently submitted again. If a storage write succeeds but its response is lost, completion reads the persisted result before deciding whether it failed.

Discard replaces the current record with a minimal cancellation marker containing only schema/mode, owner/request IDs, phase and discard time. It removes contact/address and fingerprint fields from the active application record. The marker prevents late completions or old retries from restoring the discarded contact details. This is not a claim that infrastructure backup/history retention has been purged.

Existing schema-1 records are not migrated in bulk. They can be recognized as older saved reviews, but their money/stock display requires a new current check. The owner can discard them normally. No production data namespaces are read or written by this change.

### Current-price and ownership checks

A saved review records cart, product-rule and pricing-setting revisions. Reading or recovering it compares those revisions against current server state. Changed cart quantities, manufacturer/product restrictions or pricing settings result in Recheck required, with old price/stock fields masked.

Review expiry is inherited from the cart quote. Cart quote validity is also limited by the oldest matched supplier/freight observation used, rather than being extended because a request or write took longer. Missing, invalid or future-inconsistent timestamps fail closed. Checkout totals are checked for coherent quantities, cents and sums before being returned. Tax and final payable total remain null, not zero.

Completion is conditionally written to the claimed record. A cancellation wins safely; failures do not overwrite a completed or discarded review. Current source revisions are checked again for the returned projection. This does not reserve inventory, lock all products across a future live sale, or substitute for the transaction-level design still required when actual payments and supplier dispatch are integrated.

### Shopper-facing recovery without redesign

The ordinary contact/address review form remains. Inputs are locked while saving, duplicate submits are suppressed, and an interrupted success response can be recovered with the same request. The client does not generate a different request just because a reply was lost.

Closing a slow save does not reopen the dialog later or attach its result to a different review. The user can cancel a pending review. A late response after successful cancellation is ignored. Discard clears contact fields and consent in the form. A changed/expired review shows Recheck required rather than old money, and Update cart & review again obtains the current cart and asks for renewed consent. No contact data is added to localStorage.

The approved logo, retail design, photos/gallery, SEO, image-repair queue, markup/overrides and existing manufacturer restrictions are preserved. No new cost/weight/pricing worksheet is added for shoppers.

## Verification

- 27 new targeted Node tests passed, including controlled simultaneous requests, source-revision changes, oldest-evidence expiry, cancellation-before/after/in-flight preparation, storage response loss, private record sanitization and exact ETag writes against a strict Blob test adapter.
- 751 automated Node 24 tests passed in the complete preview build (724 prior + 27 new), with no failures.
- Twelve synthetic browser workflow checks passed: normal reviewed checkout, duplicate submit suppression, same-request recovery after a lost success reply, closing while saving, cancellation against late success, cart-change recheck, on-screen expiry, preserved original logo and automatic product photos, responsive bounds, authentication/origin checks and no unexpected network traffic.
- Production-mode build gates were checked before committing. All existing assets/tripoint* files were compared to baseline bytes.
- No external reviewer or Claude agent was invoked for this stage. Review, corrections and test design were done in this workflow; tools executed the code/tests.
- Tests used synthetic products, prices and contact details, with in-memory/test-backed stores. Native live Blob lifecycle behavior and a signed-in hosted checkout check are not established by those tests. Vercel READY status verifies the deployment, not a real checkout transaction.

## Preserved release gates

Payments, tax collection, real supplier PO submission, shipment dispatch, real email delivery and public checkout remain disabled. This is a hardening milestone for the existing private review, not a market-ready payment integration or an assertion that all ordering work is complete.

Next technical dependency remains a chosen Tri-Point-owned payment processor and its test integration, then real order persistence, TD dispatch/status reconciliation, tax configuration and purchase policies. No new account connection, subscription, charge, production merge or scheduled background job was performed.

Reference checked for the storage primitive: https://vercel.com/docs/vercel-blob (conditional ETag writes) and https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage (origin reads with useCache=false).
