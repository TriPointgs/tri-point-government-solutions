# Verified checkout setup workspace — October 25, 2026

## Completed milestone
A private administrator workspace at `/admin/checkout-setup` now prepares the merchant decisions needed before product checkout activation. It is linked from Launch Center and the existing test-checkout page. It supports partial drafts, revision-checked saves, same-request recovery after uncertain responses, conflicting-editor protection and export of the saved revision as a JSON review packet.

Proposed fields cover exact purchase/return/cancellation/warranty text and version, shipping notes, tax/exemption review notes, buyer access preference and up to 100 exact TD SKU/manufacturer-part/tax-code rows. These start empty; no actual merchant decisions were entered by this task. Common credentials are rejected and the page warns against secrets, customer records and tax IDs/documents.

Draft completeness is NOT approval. The workspace always returns `approved: false` and `checkoutActivated: false`, stores only in its separate account-scoped private draft namespace and cannot write the finalizer's approved merchant policy, customer identity state, payment flags or environment variables. It displays current runtime readiness separately from the draft. A specific test confirms the approved-policy reader cannot use these drafts.

## Verified implementation and deployment
Repository: `TriPointgs/tri-point-government-solutions`.
Branch: `feature/td-product-controls`, draft PR #23.
Rollback baseline: `03e9fcc6a4cc08a6d18e718b4dc7680bf574986f`.
Implementation commit: `f6a967aac5b511bb3ac836b25ed65555d69786d2`.
Exact tested tree: `b0100516090fde05e9648f37fba2b65e512bda98`.

After the branch update, the GitHub commit was fetched into the sandbox and its tree independently matched to the locally tested staged tree.

Hosted diagnostic deployment: `dpl_AtvMDkJhdHGCRduMPW5AbnhhM1PV`.
Unique hostname: `tri-point-government-solutions-1kgfhygl3-tri-point.vercel.app`.
Stable preview: `tri-point-government-solutions-git-feature-td-edc7b1-tri-point.vercel.app`.
Vercel independently returned **READY**, Preview (`target: null`), correct commit and `aliasError: null`.

The hosted build reports **1,072 passed, 0 failed, 0 skipped**. Final validation passed for 25 preview HTML pages. This is not a production release.

## Repeated complete-suite results
| Run | Total | Passed | Failed | Intentionally skipped |
| --- | ---: | ---: | ---: | ---: |
| Sequential, concurrency 1 | 1,072 | 1,066 | 0 | 6 |
| Randomized, seed 20261025, concurrency 4 | 1,072 | 1,066 | 0 | 6 |
| Randomized, seed 7319, concurrency 8 | 1,072 | 1,066 | 0 | 6 |
| Hosted diagnostics enabled | 1,072 | 1,072 | 0 | 0 |

The six normal-mode skips are explicitly opt-in hosted-storage diagnostics. All six passed in the hosted build. Clean preview and production-mode builds also passed; the production-mode build only validates build behavior and does not publish production.

Thirty new regular tests cover shape/byte/stream limits, credential patterns, immutable save identities, stale editors, lost save responses/readbacks, concurrent editors, tenant isolation, conditional private storage, malformed stored records, anonymous/contractor denial, cross-origin writes, exports and separation from approved policy.

The existing complete-suite repeat command remains `node scripts/verify-checkout.mjs`. The production-dependency audit reported zero known vulnerabilities at test time; this does not guarantee absence of vulnerabilities.

## Actual hosted-storage evidence
The build emitted `TP_CHECKOUT_SETUP_CANARY` with all checks true:
- `realBlob`, `syntheticDraftOnly`, `roundtrip`, `replay`
- `conflictBlocked`, `merchantIsolation`, `noActivation`, `cleanup`

This used real private Blob storage under a unique disposable canary namespace with synthetic merchant/draft data only. The test did not modify actual merchant policy or user drafts and made no Stripe or TD calls. Cleanup was asserted and verified.

After inspecting the hosted result, the exact-branch Preview-only `TP_BLOB_STORAGE_CANARY` setting was restored to `off` and independently read back. The next normal build should show 1,066 passed and six intentional skips; do not label that subsequent deployment READY until separately checked.

## Browser acceptance
Three fresh Chromium processes tested desktop 1440px, mobile-touch 390px and tablet-keyboard 768px. They exercised the actual local HTTP handlers using synthetic Secure/HttpOnly/SameSite=Strict administrator cookies. All passed exact text preservation, literal HTML-like text, partial editing, JSON export, an intentionally damaged response after a committed save, identical-payload recovery, conflicting second editors and reload. No browser script errors, uncontrolled external requests or document horizontal overflow were recorded.

The existing checkout browser regression runner also passed desktop, mobile-touch and tablet-keyboard scenarios. Its provider responses are synthetic; intercepted Stripe navigation is not an actual hosted payment test.

Reproduce setup browser acceptance with `node scripts/verify-checkout-setup-browser.mjs` and the isolated Linux browser dependencies described by the existing verification scripts. Tests/processes/browser modes are NOT independent AI agents. Independent agent review remains outstanding; no such invocation or approval is claimed.

## Context and decisions
`docs/MARKETPLACE-OWNER-DECISIONS.md` was corrected to recognize the selected Stripe TEST integration and captured-before-supplier flow, while preserving unapproved merchant inputs. `docs/MARKETPLACE-CONTEXT-INDEX.md` now directs future work to focused source/state/decision/lesson records without loading unrelated projects.

Main was observed at `c61404dcd184b5c1e43a40b73e86c740b4ee375a` at the start and before the feature-branch update. Main, production, unrelated branding and Wasabi work were not changed by this task. No actual payment, refund, customer email, supplier PO or personal-memory update occurred.

## Remaining work and next action
Use **Launch Center → Checkout setup** to prepare actual merchant decisions as drafts. Review exact purchase/returns/cancellation/warranty terms, customer shipping/partial-shipment policy, tax registrations/classifications/exemptions and buyer-access choice before adopting approved configuration. Saving a proposal does not create customer accounts, publish terms or enable checkout.

The public buyer-access implementation, approved configuration, authorized product-linked hosted sandbox pilot with verified event delivery, independent review, reconciliation with current main and separately authorized production release remain outstanding. The earlier fixed-$20 test does not substitute for the product-linked pilot, and no additional fixed-$20 payment is needed for this setup work.

Detailed implementation and failure-fixture notes: `docs/CHECKOUT-SETUP-2026-10-25.md`.
