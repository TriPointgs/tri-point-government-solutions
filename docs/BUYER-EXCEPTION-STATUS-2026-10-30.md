# Buyer exception status and unsent notification consistency — October 30, 2026

## Scope and baseline
Continue `feature/td-product-controls` / draft PR 23 from `1baf23877bd95f0fd38e67498806bb0006bbd7d5`. Main was independently observed at `574c00af9004cbf3023ef8cb7f59363af758df7c`; it is not part of this patch. Keep the approved design/logo, captured-before-supplier requirement, existing pricing and separate test activation gates.

## Completed implementation
The exact saved-order read now joins the existing permanent release-stop and refund records and exposes a narrow customer-safe exception view. Both authenticated buyer portals show that view, keep stopped/refund-attempted orders held, and display the saved refund observation and timestamp instead of a misleading standalone payment-capture message. The history API uses the same exact-order read; this does not add a new history UI.

The projection checks test mode, exact order identity, full original amount, consistent supplier-stop/attempt state and plausible observation timestamps. Missing or unreadable storage does not turn into a claim of no refund. It exports no payment, charge or provider refund identifiers, merchant approval switches, stop reasons, private addresses or customer contacts. No provider request or new mutation is performed by the saved-status reads. The existing authenticated refund mutation remains separately gated and unchanged.

Pending, requires_action, succeeded, failed, canceled and uncertain states have distinct wording. After 15 minutes a saved provider observation is displayed as requiring staff recheck, not current success. This is an application display freshness rule, not a Stripe deadline, banking promise or adopted return policy. A saved success never proves bank credit. An absent local refund record does not establish that no refund exists elsewhere.

Stopped fulfillment now skips the unrelated read-only handoff record entirely, so unrelated handoff storage failures or tracking cannot obscure the permanent stop.

The existing unsent update queue now includes release-stop and refund-state drafts. It preserves historical drafts, marks superseded capture/refund observations non-current when a new snapshot is prepared, refreshes source timestamps without duplicating the same state, and checks for source changes before saving. Current means included in the last prepared snapshot, not a guarantee that the provider state is still current. The old unconditional no-refund assertion has been removed. Every draft remains NOT SENT, with no recipient or email transport. No new route, cron, dependency or storage schema is added.

## Verification before publication
Twenty new ordinary regression tests passed. The complete suite passed sequentially and under both shuffled schedules: 1,343 tests, 1,333 passed, zero failed, ten intentional hosted-diagnostic skips in each run. Clean Preview and production-mode builds passed, validating 75 and 74 HTML pages respectively. A production-mode build is not a production deployment.

All seven existing browser suites passed, plus the new buyer-exception suite: eight suites and 24 viewport/scenario combinations. The new suite covers both buyer pages at 1440px desktop, 390px touch and 768px keyboard/tablet, all six saved refund outcomes plus stale status, consent/hold behavior, unreadable-response clearing, authenticated scope and lack of provider requests. Each run uses one synthetic refund create; additional UI-state variants are explicitly synthetic saved-record fixtures. It does not execute multiple provider refunds or claim live provider semantics were verified.

The previous milestone's real private-storage diagnostic remains historical evidence. No hosted storage canary, provider probe or activation flag is enabled by this continuation. Independent external code review and the actual product-linked payment/supplier/refund pilots remain outstanding. Deployment evidence must be read from the later verified checkpoint and Vercel, not inferred from these prepublication test results.

## Remaining work and next action
The working TD UAT authentication/product-read milestone is preserved; no unchanged authentication retry or credential rotation is needed. Missing exact supplier-test inputs and merchant/tax approvals still block the real end-to-end pilot. Public buyer identity/purchasing, actual email transport and receipt verification, post-submission cancellation, delays/returns, supplier cost reconciliation and independent release review remain unfinished.

The newest TD correspondence was read only; it corrects an earlier screenshot and does not supply the missing test-order approvals. The existing follow-up remains an unsent draft. No email was sent or edited in this continuation. Private correspondence is not copied into this public repository.

References checked: Stripe Refund object status documentation and Refund and cancel payments documentation. The supported provider statuses are separate from the application's uncertain/stale display states.
