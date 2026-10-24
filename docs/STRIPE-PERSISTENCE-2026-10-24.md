# Stripe sandbox persistence repair — October 24, 2026

## Scope
Private preview only: `feature/td-product-controls`, draft PR 23. Baseline/rollback: `832917250051e6e31115c6276a281212423e4a28`. Original branding, production, commercial checkout, real supplier dispatch, customer email, and Wasabi remain unchanged. Existing user-provided evidence confirms a read-only Stripe capture; it does not establish that the saved marketplace record was finalized.

## Verified root cause
Two explicitly enabled, disposable real-Blob diagnostics ran in this branch's Vercel preview builds. No Stripe API call, payment, original sandbox record, customer record, or supplier order was involved.

- Small JSON: upload/get/head version tags agreed; conditional write passed.
- Larger synthetic JSON: the default private GET returned Brotli compression and a weak ETag. That ETag did not equal the upload/head ETag, and the conditional write failed with a precondition error.
- The same large record read with `Accept-Encoding: identity` returned the original strong ETag. Conditional update passed, a stale update was rejected, and the disposable record was deleted.
- Evidence: diagnostic commit `99d71d40d246229e727906e37fa2edb9af65f8f8`; preview `dpl_3939ZFe8XEH7ypkzV5ZrQ9iM8JuZ`; build log `TP_BLOB_CANARY_SAFE_RESULT` reports defaultCAS=precondition, identityCAS=passed, defaultEncoding=br, defaultTagShape=weak, staleWriteRejected=true, cleanup=true.

The application already requested uncached reads. Cache clearing and retries could not repair a representation-specific weak version tag. The fix requests an uncompressed representation and rejects weak/compressed versions. It does not strip W/, substitute a separate head() version for fetched content, disable ifMatch, or overwrite unconditionally.

The shared read helper is applied to the six preview checkout/payment stores using response ETags: checkout drafts, final orders, tracking, payment verification, Checkout Sessions, and the isolated sandbox ledger. No production datastore migration or tax-policy approval is performed.

## Recovery and UI
An authenticated, same-origin, rate-limited administrator action can explicitly verify and save an EXISTING sandbox test via its PaymentIntent ID. It requires separate consent, exact merchant/mode/metadata/digest/session/payment linkage, and the existing captured-charge/risk checks. It does not manufacture missing records, transfer browser ownership, remove adverse-event holds, create a Session, or permit a commercial/supplier order. Ordinary owner-scoped test access is unchanged.

Read-only verification remains read-only. The interface distinguishes processor confirmation from a saved sandbox record. A malformed client UUID expression was separately reproduced by executable client tests and repaired; valid URL references now survive blocked sessionStorage, and duplicate run parameters are rejected. PaymentIntent IDs are not stored in browser storage. A consent-checkbox width rule was corrected after an actual mobile browser test exposed overflow.

## Local verification
- Clean preview build: 957 passed, zero failed; two hosted-storage canaries skipped without their explicit flag.
- Clean production-mode build: same test result and production gates; 24-page build passed. This was NOT a production deployment.
- An initial production build following preview failed because old generated files remained in dist. The unchanged baseline and a clean repaired production build both passed. Clean dist before switching build modes; no source/build-policy change was needed.
- Six synthetic Chromium/Playwright workflows passed: missing-reference recovery, read-only confirmation, explicit save, persisted capture, valid UUID restoration, and refund hold. No script errors, uncontrolled external requests, real payments, or supplier orders. Widths 390, 768, 1440 had no horizontal overflow after the checkbox fix.
- Original-logo regression test remains passing.

## Hosted verification gate
`tests/blob-storage-canary.test.mjs` is disabled unless the exact preview branch AND TP_BLOB_STORAGE_CANARY=diagnose are present. Its second test exercises the actual corrected sandbox service and real Blob storage with injected Stripe fixtures, using a unique disposable canary path. It verifies persisted capture, repeat recovery, stale-write refusal, one winner in concurrent writes, and deletion. Read the deployment logs before claiming this new round trip passed. Disable the temporary branch-only canary flag after verification.

A real existing user's payment-to-saved-record recovery still requires an authenticated preview action. The successful read-only screenshot is not proof of that write. No live charge, new hosted test payment, production merge, TD purchase order, customer email, or persistent-memory write is authorized by this checkpoint.
