# Marketplace context index

## Stable workflow and boundaries
Tri-Point Government Solutions; repository TriPointgs/tri-point-government-solutions. Continue scoped work on feature/td-product-controls / draft PR 23. Verify current refs and deployments before changes; do not infer success from an earlier assistant response. Keep main, production, unrelated branding and Wasabi work untouched unless separately authorized. Never store credentials/customer records in this public repository. Captured payment, not authorization alone, precedes any supplier-release design. Repeated whole-suite and differing browser tests are requested; never call test workers independent AI agents.

## Current implementation checkpoint — October 30, 2026
Read `docs/BUYER-EXCEPTION-STATUS-VERIFIED-2026-10-30.md` first for the latest tested implementation and deployment evidence. Commit `b82e6e6009931f55b64aa895202bc8d8388de2be`, tested tree `d77d4b1219e77ac15a1187402a16a1a640623a61`, deployed as `dpl_7ECmNRXaKR8ohKT4USHKNN1Lquyz`; Vercel returned READY, correct feature branch/commit, Preview target and no alias error. Main remained `574c00af9004cbf3023ef8cb7f59363af758df7c` and was not modified.

Both private buyer views now reflect saved supplier-release stops and refund observations. The saved-order/history API shares the same narrow exception projection. Unsent notifications include stop/refund state without claiming no refund or creating duplicate state drafts. Refund timestamps and stale observations remain distinct from current provider or bank-credit proof. No actual payment/refund, supplier order, email, approval or public activation was performed. The full suite passed in three orders (1,343 tests, 1,333 pass, zero failures, ten intentional optional diagnostic skips); eight browser suites/24 viewport-scenario combinations and clean Preview/production-mode builds passed. A production-mode build is not production publication. No hosted storage canary was rerun in this continuation.

Read `docs/BUYER-EXCEPTION-STATUS-2026-10-30.md` only for detailed implementation. Its verification is synthetic/local plus build evidence, not an actual product-linked provider pilot. The documentation-only checkpoint/index build following the implementation must be verified separately in live Vercel.

## Prior order-exception milestone
Read `docs/ORDER-EXCEPTIONS-VERIFIED-2026-10-30.md` and, when needed, `docs/ORDER-EXCEPTIONS-2026-10-30.md` for the permanent pre-submission stop, same-record supplier race control, separately gated exact full TEST refund and single-attempt recovery. The protected administrator workspace is `/admin/order-exceptions`. The prior milestone verified actual private Blob persistence and cleanup using synthetic provider transports. It did not execute an actual Stripe refund or approve transaction flags. Its ordinary suite had 1,323 tests; the newer checkpoint above supersedes that count.

## Supplier connection milestone — October 30, 2026, 17:27 UTC
TD Sandbox OAuth and the exact UAT product read succeeded after the owner saved a newly generated Sandbox client secret. The credential records were observed as sensitive, Preview-only and restricted to feature/td-product-controls. Values were not decrypted, copied into chat/local files or published in this repository.

The unchanged application source `96e52dc006030228cb3cc93a1d949ba247333c39` ran the exact-commit opt-in `scripts/verify-td-uat.mjs`. The actual report timestamp was `2026-10-30T17:27:40.054Z` (1:27:40 p.m. America/New_York). It reported oauthAuthenticated=true, one OAuth request, one US UAT GetPriceAvailability request and status=uat-product-response-verified. Deployment `dpl_6vTuprjePjK1JuULZfrZsaQ71XHj`, hostname `tri-point-government-solutions-9ne4nckhw-tri-point.vercel.app`, was independently READY with the correct source and no alias error.

The result matched TD SKU `7825493` / manufacturer part `UNIVK-LAPTOP-LOCK`; the item was active, positive regular unit cost was present, stock was known with at least one available, parcel shipment was indicated, end-user requirement was not indicated and normalized issues were empty. Exact costs, quantities, raw responses, account identifiers and tokens were not published. These are UAT observations, not production pricing/stock, reservation, shipment or supplier acceptance.

currencyConfirmed remained false because separate UAT currency confirmation was missing. This does not establish a non-USD account. Do not silently substitute production-reader currency evidence or authorize purchasing from this read-only result. TP_TD_UAT_READ_PROBE_COMMIT was restored to off and read back. No further unchanged authentication retry or rotation is needed. Earlier invalid_client results are historical, not current status. The successful new pair does not by itself prove the cause of earlier failures.

## Decisions versus proposals
Selected: Stripe TEST integration, captured-before-supplier requirement, existing 15% default markup (not proof of total order profitability), approved storefront design and existing logo. Still unapproved: purchase/return/cancellation/warranty terms, customer shipping policy, tax registrations/classifications/exemption review, public guest/account access and live release. Merchant drafts remain proposals. Browser-session history and administrator recovery are not permanent buyer accounts. One-order invitations are not verified email identity.

The latest TD correspondence corrects an earlier screenshot; it does not complete the missing UAT order inputs. The existing technical follow-up remains unsent. This continuation read correspondence only and made no email change. Retrieve live correspondence through the authorized mailbox before any future use; do not copy private messages or account identifiers into this public repository.

## Remaining work / next action
Obtain explicit UAT currency, approved synthetic ship-to/contact details, service selection, non-physical fulfillment assurance and the separately approved spending ceiling. Review the existing merchant draft and tax headquarters/registration/product classification inputs without inventing approval. Then complete the actual product-linked Stripe TEST payment/event recovery, separately approved supplier submission/reconciliation and actual test-refund recovery. Uncertain supplier attempts must be reconciled, not resubmitted.

Public purchasing/buyer identity, actual transactional email transport and receipt verification, post-submission supplier cancellation, delay/return operations, supplier-cost reconciliation, independent review and public release authorization remain unfinished. Passing synthetic tests, configured credentials and a READY Preview are not public-launch readiness.

## Other focused workflow references
- `docs/UAT-AND-RELEASE-READINESS-2026-10-30.md`: UAT probe, rejection diagnostics, pinned-main reconciliation and launch-status corrections. Earlier failed provider results are historical.
- `docs/LAUNCH-PREPARATION-2026-10-29.md`: exact-commit additive TEST-webhook repair, signed no-op transport check and create-only unapproved merchant draft; use its verified checkpoint for actual outcomes.
- `docs/PILOT-READINESS-AUDIT-2026-10-29.md`: bounded read-only provider/two-record storage audit; configuration presence is not pilot verification.
- `docs/BUYER-CHECKOUT-2026-10-27.md`: separate one-order payment invitation, terms acceptance, same-Session recovery and buyer-safe fulfillment. Read-only links stay read-only.
- `docs/FULFILLMENT-PILOT-2026-10-27.md`: gated one-shot TD UAT submission/recovery and persistent unsent updates; not an executed supplier pilot.
- `docs/ORDER-ACCESS-HANDOFF-2026-10-26.md`: buyer read-only capability lifecycle and separately scoped supplier status handoff, not SubmitPO.
- `docs/CHECKOUT-SETUP-2026-10-25.md`, `docs/CHECKOUT-VERIFIED-2026-10-25.md`, `docs/CHECKOUT-ACCEPTANCE-2026-10-25.md`: private merchant setup, verified checkout baseline and detailed recovery checks.
- `docs/MARKETPLACE-OWNER-DECISIONS.md`: decided payment flow versus unapproved merchant inputs.

## Focused implementation workflow
Read AGENTS.md, this index and only the needed workflow. Inspect PR 23/current head and live deployment before editing. Reuse existing shop/checkout routes and private storage boundaries. Run `node scripts/verify-checkout.mjs` and relevant browser suites with isolated tools. Run builds serially against clean dist output, not concurrently. Hosted storage diagnostics remain opt-in, synthetic and disposable: verify cleanup and restore the diagnostic flag to off after any separately authorized run. Save a verified checkpoint after deployment. Unrelated solicitation and personal/business history are not needed.

## Verified reusable lessons
A browser return is not payment proof. Recover the same order/request after uncertainty; uncertain supplier/refund attempts are not permission to resend. Preserve strong storage versions and no-cache private reads for conditional writes. Do not weaken safeguards to make fixtures pass. Readiness, service configuration, approved policy, an actual provider pilot and production release are different facts. Test workers and browsers are not independent AI agents. A permanent release stop, unpaid checkout expiration, supplier cancellation and refund are distinct operations. A saved provider observation is not bank credit; an absent local refund record does not establish no refund elsewhere. Keep historical observations and unsent snapshot status explicit.
