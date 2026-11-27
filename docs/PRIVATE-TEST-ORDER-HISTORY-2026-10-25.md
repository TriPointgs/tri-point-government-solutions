# Private test order history checkpoint — October 25, 2026

## Scope
Tri-Point's existing feature/td-product-controls draft PR #23 only. Baseline is verified preview commit 6f08c60787f29583ce69111b1c10627f1a154061. No main merge, production publication, newly created Stripe Session/payment, real customer order, TD PO, customer email, tax approval, or supplier dispatch. Existing Wasabi site work, approved branding and earlier fixed-$20 Stripe sandbox verification are untouched.

## Implementation
The existing /shop-preview/checkout page now includes **My private test orders** with simple next-page pagination and a Refresh control. The private shop navigation links to the same page. The user sees only orders for the original signed cart-browser owner. There is no email lookup, directory-wide search or claim of persistent customer accounts: this is owner-scoped private TEST history, not public account history.

A new private Blob pointer is stored at preview/cart-order-history/v1/<sha256(account,owner)>/<final-order-uuid>.json. It stores only immutable order ID, review ID, createdAt, scoped digest and schema/mode: no buyer contact, tax certificate, payment ID or supplier cost. The history index is created only AFTER finalization's authoritative order record has been independently read back. A duplicate finalization indexes the SAME deterministic order without overwrite. If the pointer write fails, the route explicitly says the order is saved but not indexed and directs a retry of the same review; an additional Stripe payment is never the remedy.

Every history page is bounded to 10 entries, limits cursors, validates each private pointer and calls the original order-read and payment-ledger services to confirm owner/review/createdAt and produce a safe status projection. No Stripe read or payment action is triggered by browsing history. Public payment and TD dispatch remain disabled. Payment evidence older than the permitted freshness window is labeled needs-recheck rather than presenting a current capture; expired quotes cannot become payable just because they appear in history.

The endpoint reuses existing /api/shop and the administrator authentication, original signed browser cart owner, same-preview-environment requirement and read rate limits. Missing cookies are not silently replaced for private order access. Production checkout routes remain unavailable. Underlying flags still require reviewed purchase terms, shipping policy, tax configuration and explicit test activation; no flags or business approvals are changed by this work.

## Tests and evidence
- The baseline checkout suite remains intact.
- Added test coverage for immutable owner-scoped index creation, duplicate prevention, owner and merchant isolation, pointer corruption, cursor validation, pagination, safe recovery after uncertain indexing, no-provider browsing, stale-payment status and malformed UI history links.
- Browser UI tests use synthetic responses and verify pagination without Stripe requests. No real customer data is used.
- A gated synthetic hosted Blob canary, tests/cart-order-history-hosted.test.mjs, is disabled unless the exact feature branch and temporary TP_BLOB_STORAGE_CANARY=diagnose are both set. It exercises 11 private Blob pointers and a second owner, validates replay and two-page navigation, and deletes every unique disposable canary path before reporting success. Do not claim hosted success until a deployment log explicitly shows all flags true and cleanup=true. Disable the temporary flag after verification.

## Remaining business/development work
This is not a conventional customer login/order portal. Future work still needs durable customer accounts and migration from browser-session ownership after an owner-approved identity model; approved tax/purchase/returns/shipping policy; abandoned checkout and refund operational workflow; TD SYNNEX supplier acceptance and uncertain-order response handling; customer communications; actual hosted product-linked payment test; final integration with main and explicit production release. No real transaction or production changes were authorized here.

## Verified private-preview deployment checkpoint
The source implementation commit is `659299cf05534fe4bb035b006abf70878526ee62` (local tested tree `0464ea501b3a9f577f34337b463094951c160bb4`). The isolated hosted build `dpl_J9y7HVmK4mu8GYedwyuU8cSxjUUj` passed all **1,006 tests** with **zero failed and zero skipped**, including the explicitly enabled synthetic real-Blob owner-history test. This test exercises cleanup as a required assertion. No external Stripe payment or TD supplier order was initiated.

The temporary branch-scoped `TP_BLOB_STORAGE_CANARY` flag was restored to `off` and verified. The normal preview rebuild `dpl_87cndzkuKE5hxAwPSsGKZ6nEmPYb` was independently checked **READY** for the same implementation commit, with **1,002 passed, zero failed and four intentionally skipped diagnostics**. Both deployments targeted **Preview**, not production. PR #23 remains draft and unmerged. Existing orders are not retroactively indexed; owner-session identity is not a permanent customer login.
