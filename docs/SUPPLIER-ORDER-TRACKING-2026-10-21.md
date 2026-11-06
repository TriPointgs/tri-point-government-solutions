# Supplier order status and tracking — October 21, 2026

Project: Different Solicitations / Tri-Point marketplace. Existing draft PR 23 and branch feature/td-product-controls. Baseline: 26a2885d21f8481e003b8a6d0be171f7c5ed7354.

## Why this was next

The owner asked us to choose the next task and continue, rather than hand it to Claude or repeat a payment-account question. The verified branch already contained the checkout-reliability fixes: durable preparation claims, cancellation markers, same-request recovery and quote freshness. Those changes were preserved, not reimplemented. Payment provider selection remains unresolved, so this stage advances the supplier-status side of order fulfillment without depending on a payment account.

## Implemented

A new merchant-only page, /admin/fulfillment, reads an existing TD SYNNEX purchase-order or sales-order reference. It shows separate supplier sales orders, line/subline details, reported backorders, supplier estimated dates, tracking references and a saved change history.

It uses the supplied US API contract: GET /api/v1/webservice/json/GetOrderStatus/orderNo/{orderNo}, with inputType=PO-v2 or SO. The user-provided openapi (2).json documents multiple sales-order responses for one PO, dates on sublines, and HTTP-200 responses that can contain errorMessage. Those conditions are handled explicitly rather than assuming transport success is order success.

The existing TD read-only OAuth connection and production-read approval are reused. No new credential or mandatory enablement step was added. An optional TP_TD_ORDER_STATUS_ENABLED=false kill switch can disable status reads independently. No environment variables were changed in this work.

Only an explicit merchant check requests supplier status. Opening the page or reloading saved records does not poll TD. No timer, cron or external monitoring task was enabled. This read-only adapter can be reused by a later order workflow once website orders and their customer bindings exist.

## Data and transaction boundaries

- Every returned PO must match the requested reference, and every SO must have a unique identity. Conflicting order aliases fail closed. Errors mixed into a successful-looking array also fail closed.
- Split shipments and backordered lines remain separate. Ordered, subline and tracking quantities are never added into a guessed shipped total. A kit/bundle is identified for review, not interpreted as ordinary unit totals.
- A subline that names a different manufacturer part or supplier part does not publish its tracking against the parent product.
- Supplier costs, raw error details, addresses, customer emails, invoice values, serial numbers and license keys are dropped before persistence/display. Raw provider tracking URLs are not used. UPS/FedEx/USPS links are constructed from constrained tracking references; other carriers remain plain text.
- A supplier status, ship date or tracking number does not prove carrier collection/delivery or customer payment. The page labels this as supplier-reported information. Date strings retain supplier formatting; no unspecified timezone is invented.
- UAT responses remain marked UAT test. Production-read configuration is not proof that a real order-status call succeeded.

## Persistence and concurrency

Observations are stored in a separate private preview namespace partitioned by a digest of the supplier account/environment. References are not stored in public paths or repositories. Origin reads use useCache=false and the actual Blob ETag; changes use conditional ifMatch writes with the pinned @vercel/blob 2.8.0 dependency.

An exact reference gets one saved record. Duplicate registration returns the existing record without making another provider request. Each refresh has a durable claim token before the supplier GET; competing requests cannot both start the same current check. A superseded late response cannot overwrite a newer observation. A lost storage acknowledgement is reconciled by reading the saved claim/completion token.

A changed normalized observation adds one event in the same versioned record; unchanged refreshes do not add duplicate events. History retains at most 100 displayed events and a total event count. Failed refreshes preserve the previous successful snapshot but mark it historical/non-current. Checks older than 15 minutes are stale, including a local UI status update without another provider call.

This is an internal supplier-observation ledger, not a customer order ledger. No checkout review becomes a real supplier order. No customer portal, shipment email dispatch, payment authorization/capture or PO submission is activated.

## Access and design

The page is routed through the existing commerce function, with signed staff authentication, same-origin POST checks, strict input fields, request limits, no-store/noindex headers, and the existing production-release guard. The original simulation order lab remains separate. Anonymous and contractor sessions cannot read the supplier records.

The Launch Center links to the new page and reports the status-reader implementation separately from live validation, customer access and email integration. The approved storefront layout, logo artwork, photos, search, cart, checkout review, SEO and pricing/MAP controls were not redesigned or relaxed.

## Verification

- 35 new focused Node tests passed; the full suite passes 786 tests (751 baseline + 35 new).
- Fifteen synthetic browser workflows passed, including staff login, exact existing-PO lookup, split/backordered shipments, safe tracking links, change deduplication, failed-read history, duplicate reference handling, no provider calls on saved-list reload, sensitive-data stripping, CSRF/input rejection, three responsive widths, Launch Center linking, preserved storefront, anonymous denial and no script errors.
- Tests used synthetic supplier responses and memory/strict storage adapters. They made zero real TD requests, payment requests, PO submissions or email sends. Actual first hosted existing-order validation and live persistence are not established by those tests.
- One bounded independent review of only the normalizer/service/store identified contradictory supplier order aliases; that was corrected and regression-tested. No Claude handoff, recursive workers or full-repository audit was performed.
- An existing unrelated test process occupied port 3000. We did not stop it. A temporary local runner on port 3017 was used and excluded from the commit.
- Screenshots were generated; transferring one to the local visual-inspection tool failed due network/download access. Automated layout and browser interactions passed; manual pixel-by-pixel visual inspection is not claimed.
- Production-mode and final Preview builds are checked before committing. Original assets/tripoint* files are compared byte-for-byte with the baseline. Hosted deployment readiness is verified against the exact resulting commit separately.

## Current boundary and next step

The first real validation needs an existing order reference in the connected Tri-Point TD account. Do not place a new order just to test this page, and do not use a checkout-review ID as a TD reference. A supplier permission/not-found response should remain a failed verification, not be converted to a synthetic success.

The next fulfillment work is to bind status updates to durable website orders and a transactional notification outbox, then connect authenticated customer order access. Payment/tax setup, actual purchase policies, PO dispatch/reconciliation, always-on catalog infrastructure and an approved live pilot are still required before public sales. No production merge or public launch occurred here.

Source contract: user-provided openapi (2).json, GetOrderStatus operation and OrderStatusDetail/Line/SubLine/Tracking schemas. No unsupported carrier-delivery semantics or undocumented API routes were substituted for that source.
