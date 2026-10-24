# Stripe sandbox persistence repair — October 24, 2026

## Scope and verified source
Private preview only: `feature/td-product-controls`, draft PR 23. Baseline/rollback: `832917250051e6e31115c6276a281212423e4a28`. Original branding, production, commercial checkout, real supplier dispatch, customer email, and Wasabi remain unchanged. The user's screenshot confirms read-only Stripe capture; it does not establish that their saved sandbox record was finalized.

The implementation commit is `991df9b6927092e80cfc27d46b18a9590f4b922d`, exact tree `ec65c04b45fae726017598136add49041a673c6d`, independently matched to the locally tested source. Its fifteen-file diff contains no logo, credentials, customer data, or production configuration changes. Later commits refine only the hosted storage test and this documentation.

Verified successful hosted commit: `5055df4b303192aa22457bfe53eb84aa45cdec52`.
Deployment: `dpl_F24DbLbvkidgoNZSLvEoUmnZNPny`, READY, target null (Preview), aliasError null.
Unique host: `tri-point-government-solutions-ql1etb157-tri-point.vercel.app`.
Stable host: `tri-point-government-solutions-git-feature-td-edc7b1-tri-point.vercel.app`.

## Verified root cause
Explicitly enabled, disposable real-Blob diagnostics ran in this branch's Vercel preview builds. No Stripe API call, payment, original sandbox record, customer record, or supplier order was involved.

- Small JSON: upload/get/head version tags agreed; conditional write passed.
- Larger synthetic JSON: the default private GET returned Brotli compression and a weak ETag. That ETag did not equal the upload/head ETag, and the conditional write failed with a precondition error.
- The same large record read with `Accept-Encoding: identity` returned the original strong ETag. Conditional update passed, a stale update was rejected, and the disposable record was deleted.
- Evidence: diagnostic commit `99d71d40d246229e727906e37fa2edb9af65f8f8`; preview `dpl_3939ZFe8XEH7ypkzV5ZrQ9iM8JuZ`. The same behavior was reproduced in the final successful hosted build.

The application already requested uncached reads. Cache clearing and retries could not repair a representation-specific weak version tag. The fix requests an uncompressed representation and rejects weak/compressed versions. It does not strip W/, substitute a separate head() version for fetched content, disable ifMatch, or overwrite unconditionally.

The shared read helper is applied to six preview checkout/payment stores using response ETags: checkout drafts, final orders, tracking, payment verification, Checkout Sessions, and the isolated sandbox ledger. No production datastore migration or tax-policy approval was performed.

## Recovery and interface
An authenticated, same-origin, rate-limited administrator action can explicitly verify and save an EXISTING sandbox test via its PaymentIntent ID. It requires separate consent, exact merchant/mode/metadata/digest/session/payment linkage, and the existing captured-charge/risk checks. It does not manufacture missing records, transfer browser ownership, remove adverse-event holds, create a Session, or permit a commercial/supplier order. Ordinary owner-scoped test access is unchanged.

Read-only verification remains read-only. The interface distinguishes processor confirmation from a saved sandbox record. A malformed client UUID expression was separately reproduced by executable client tests and repaired; valid URL references now survive blocked sessionStorage, and duplicate run parameters are rejected. PaymentIntent IDs are not stored in browser storage. A consent-checkbox width rule was corrected after an actual mobile browser test exposed overflow.

## Local verification
- Clean preview build: 957 passed, zero failed; two hosted-storage canaries skipped without their explicit flag.
- Clean production-mode build: same test result and production gates; 24-page build passed. This was NOT a production deployment.
- An initial production build following preview failed because old generated files remained in dist. The unchanged baseline and a clean repaired production build both passed. Clean dist before switching build modes; no source/build-policy change was needed.
- Six synthetic Chromium/Playwright workflows passed: missing-reference recovery, read-only confirmation, explicit save, persisted capture, valid UUID restoration, and refund hold. No script errors, uncontrolled external requests, real payments, or supplier orders. Widths 390, 768, 1440 had no horizontal overflow after the checkbox fix.
- Original-logo regression test remains passing.

## Hosted verification: passed
The actual Vercel build for `5055df4` reports 959 tests passed, zero failed, zero skipped, 25-page final experience validation passed, Deployment completed; READY was independently read.

Its `TP_SANDBOX_STORAGE_ROUNDTRIP` test uses the real corrected sandbox service and real Blob storage, with injected Stripe fixtures and a unique disposable canary path. Verified booleans:

- capturePersisted: true (save plus independent reread)
- repeatedRecoverySafe: true (one synthetic Session only)
- staleRejected: true
- singleConcurrentWinner: true
- concurrentWinnerPersisted: true
- loserRetryRejected: true (old version cannot overwrite the winner)
- cleanup: true (disposable record deleted and absence confirmed)

Two earlier release builds failed because the test assumed every competing-write rejection would be the SDK's BlobPreconditionFailedError. Live results showed exactly one successful writer and a generic BlobError for the overlapping loser. The test was corrected to verify the actual safety properties: exactly one successful writer, the winner's exact stored marker, and the loser's stale retry rejected with BlobPreconditionFailedError. Application handling of unexpected storage errors still fails closed; no permissive retry or unconditional overwrite was introduced. The specific underlying provider code for the generic concurrent BlobError was not established, and is not claimed.

`TP_BLOB_STORAGE_CANARY` is branch-scoped, Preview-only, non-secret. It was changed from `diagnose` to `off` after hosted verification. Both real-storage tests stay disabled by default. All disposable canaries from observed diagnostic runs were removed. No recurring diagnostic task was created.

## Remaining authenticated test and next stage
Open the stable preview's `/admin/stripe-checkout`, sign in as administrator, enter the SAME PaymentIntent ID already confirmed by the read-only workflow, check the separate consent to save the existing sandbox record, and select **Verify and save existing test**. Expected: **Sandbox capture verified and saved** and **Saved (sandbox only)**, with commercial order not created and TD ordering disabled. Do not make a new payment.

A real existing user's payment-to-saved-record recovery still requires that authenticated preview action. This milestone verified the storage path using real Blob and synthetic Stripe; it does not claim to have modified the user's seven existing payments or their saved test records. The successful read-only screenshot is not proof of that write.

After that evidence is obtained, proceed to the separately gated cart-to-order customer checkout and payment reconciliation work. Approved tax classifications/registrations, merchant purchase/shipping/returns terms, late payment/quote expiry, refund handling, TD PO idempotency/acceptance/uncertain-response recovery, customer order history and notifications, catalog hosting and final main reconciliation remain launch requirements. No live charge, new hosted test payment, production merge, TD purchase order, customer email, or persistent-memory write occurred here.
