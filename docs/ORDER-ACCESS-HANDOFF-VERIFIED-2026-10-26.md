# Verified paired marketplace patch — October 26, 2026

## Two completed private-preview features

1. **Buyer-facing read-only test-order access** at `/buyer-preview/order`: an administrator-issued, single-use invitation grants access to one saved test order without administrator or original cart cookies. Invitations expire in 15 minutes; redeemed sessions last one hour. Replacement, revocation and logout invalidate access, including a revocation/expiry that happens while an order read is in progress. The buyer sees a restricted item/total/payment/fulfillment projection, not contact/address data, payment identifiers, supplier PO/account details or margins. This is NOT a permanent account, verified email identity or purchasing checkout. Links are manually delivered, not emailed.
2. **Durable supplier handoff and exact UAT reconciliation** at `/admin/order-operations`: prepare rechecks the existing captured Stripe TEST payment, current sourcing and original quote; an order-specific deterministic reference is bound to merchant and supplier scope. Read-only TD UAT reconciliation requires exact reference, SKU, manufacturer part and quantity. Ambiguous/missing/duplicate product data, stale observations and provider failures are held. Only matched, fresh, recognized-carrier tracking reaches the buyer view. Supplier text does not establish independent delivery confirmation. This is NOT a SubmitPO or automated purchasing implementation.

Both features are part of one implementation patch. The administrator page is linked from the existing private checkout/history screen as **Buyer access and supplier handoff tools**. The two new runtime gates, `TP_BUYER_ORDER_PREVIEW_ENABLED` and `TP_SUPPLIER_HANDOFF_PREVIEW_ENABLED`, were NOT enabled or added by this task. No actual buyer invitation or supplier handoff was created outside synthetic tests. Disabled controls until reviewed activation are expected.

## Verified implementation and deployment

Repository: `TriPointgs/tri-point-government-solutions`.
Branch: `feature/td-product-controls`, draft PR #23.
Rollback baseline: `4d0942ca9816b9f6299bfecd3ae3e41a83db0caa`.
Implementation commit: `b54ec528dc801c41404df18eae82ee3da5ed1d49`.
Exact tested tree: `5f75947a32a84dca56d879114cbdb6b2eb29c941`.

After updating the feature branch, its commit was fetched into the sandbox; the remote tree independently matched the local tested staged tree exactly.

Hosted diagnostic deployment: `dpl_5zAUEuZTtki6gvdPsoxDqoFQCYHM`.
Unique hostname: `tri-point-government-solutions-b6732euqt-tri-point.vercel.app`.
Stable preview: `tri-point-government-solutions-git-feature-td-edc7b1-tri-point.vercel.app`.
Vercel independently returned **READY**, Preview (`target: null`), correct commit and `aliasError: null`.

Its build reports **1,130 tests passed, 0 failed, 0 skipped**. Final validation passed for 25 preview HTML pages. This is not a production deployment.

## Repeated complete-suite and browser verification

| Run | Total | Passed | Failed | Intentionally skipped |
| --- | ---: | ---: | ---: | ---: |
| Sequential, concurrency 1 | 1,130 | 1,123 | 0 | 7 |
| Randomized seed 20261025, concurrency 4 | 1,130 | 1,123 | 0 | 7 |
| Randomized seed 7319, concurrency 8 | 1,130 | 1,123 | 0 | 7 |
| Hosted diagnostics enabled | 1,130 | 1,130 | 0 | 0 |

The seven normal-mode skips are explicit opt-in hosted-storage diagnostics. All seven ran successfully in the hosted diagnostic build. Clean preview and production-mode builds passed separately; building in production mode does not release production.

Fifty-seven new regular tests cover invitation scope, hashing, single use, TTL, concurrent issuance/redemption, revocation/logout, in-flight revocation/expiry, buyer/administrator separation, private projections, same-origin writes, cookie/query restrictions, storage bounds and isolation, strong-version conditional updates, lost responses, captured-payment and quote requirements, UAT-only supplier reads, exact supplier identities, duplicate/split-order ambiguity, stale tracking, changed supplier account and adverse-payment holds.

The new browser suite passed in desktop 1440px, touch-mobile 390px and keyboard-tablet 768px Chromium runs, including a final rerun after publication of the implementation commit. Actual local HTTP handlers used separate buyer/admin browser contexts and synthetic Secure/HttpOnly/SameSite=Strict cookies. Checks included explicit redemption, fragment removal, no token in GET URLs, buyer denial on administrator endpoints, exact totals, sanitized tracking, replay refusal, reload, revocation, replacement invitation on an already-open page, logout and layout overflow. Zero browser script errors, uncontrolled external requests, real payments or supplier purchases were recorded.

The existing checkout and merchant-setup browser suites also passed all three device/input scenarios. All provider responses in browser tests were synthetic; no actual Stripe or TD request occurred. Commands: `node scripts/verify-checkout.mjs`, `node scripts/verify-order-operations-browser.mjs`, plus the two existing browser runners.

A real browser defect was reproduced and fixed: replacing the invitation fragment on an already-open buyer page failed to initialize fresh access. Fragment changes now force fresh page initialization and explicit redemption. The new browser harness disables packaged Chromium's single-process mode to verify truly separate cookie contexts while preserving web security. A cache-header test was corrected to compare required directives rather than their order.

Production dependency audit reported zero known vulnerabilities at test time. This is not an independent penetration test or security certification. No independent AI reviewer was invoked; separate processes/browser modes are not agents.

## Actual hosted-storage evidence

The diagnostic build emitted `TP_ORDER_OPERATIONS_CANARY` with:

- `realBlob: true`, `syntheticProviders: true`
- `invitationSaved: true`, `singleUse: true`, `buyerReadBack: true`
- `revoked: true`, `supplierPrepared: true`, `supplierMatched: true`
- `staleTrackingHeld: true`, `cleanup: true`

Actual private Blob extension records were written under a unique disposable canary prefix. Orders, payments, sourcing and supplier observations were synthetic fixtures. Existing business records were not changed. Cleanup was asserted and absence confirmed.

The exact-branch, Preview-only `TP_BLOB_STORAGE_CANARY` setting was restored to `off` and independently read back after verification. The following documentation-only normal build should report 1,123 passed, zero failed and seven intentional skips; its READY status must be separately checked before claiming it.

## Boundaries and remaining work

The feature branch remains unmerged and no production release is authorised by these results. Main was observed at `c61404dcd184b5c1e43a40b73e86c740b4ee375a` before implementation and before publishing this patch. No live payment, new real Stripe Session, refund, TD purchase order, customer email, cron, unrelated branding/Wasabi change or personal-memory write occurred.

This patch advances two pieces of the marketplace; it does not finish permanent public buyer accounts/guest purchasing or supplier ordering. Remaining launch requirements include the approved buyer identity/access/delivery model, actual merchant terms/shipping/tax configuration, authorised product-linked hosted sandbox pilot with event delivery, actual supplier submission/acceptance/uncertain-response recovery, notification transport, independent review, current-main reconciliation and separately authorised production release.

Next technical stage: connect the chosen buyer purchasing flow and approved supplier submission adapter to these tested read-only access and handoff boundaries. Before activating the two preview features, use reviewed flags and synthetic/pilot records only; do not treat a valid handoff as permission to purchase.

Implementation details and reproducible failure notes: `docs/ORDER-ACCESS-HANDOFF-2026-10-26.md`. Focused project context: `docs/MARKETPLACE-CONTEXT-INDEX.md`.
