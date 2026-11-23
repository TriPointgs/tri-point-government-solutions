# TD SYNNEX sandbox checkout — November 23, 2026

## Authorization and decisions
The owner requested TD SYNNEX sandbox checkout and then selected **Prepare checkout; hold TD submission**. Work is limited to the existing private `feature/td-product-controls` preview / draft PR 23. Main, production purchasing, real payments, supplier submission, account credential rotation and outbound correspondence are excluded.

## Source recovery
The November 20 preview `dpl_E3ux17PWw6RHTsd9Ry19BPuVDLqW` was READY and reported source commit `48255c5b6b3d67a1d400a827db5b16d11d38e815`, which GitHub did not contain. The repository branch was still `7bdbeef49df7c8157fd4301296fc92bdc907afda` (rollback). Source enumeration found 399 source files. There were 76 meaningful source changes after excluding newline-only differences: 15 matched files already in main and 61 recovered through the signed-in deployment Source view. Every recovered file was matched to its original deployment SHA-1 before LF normalization. No credentials were decrypted or copied. Tests/docs absent from the deployment retain their repository base; outdated fixtures were aligned to the recovered account-only and shipping-tax rules without weakening those guards.

## Implemented behavior
- The explicit sandbox flag selects a lazy read-only UAT adapter using only the dedicated UAT credentials, pinned US UAT API and approved OAuth endpoint. Unrelated general/admin production configuration cannot fill missing UAT values. Wrong preview/branch/endpoint scope fails closed.
- Cart quotation, delivery, finalization and default service constructors require matching UAT observations and UAT freight. Legacy production quoting is retained only outside this explicit sandbox mode. The Lenovo simulated cost reader and separate delivery path are disabled in this mode.
- Missing UAT currency confirmation blocks new supplier reads and new checkout payments. It does not silently use the production account USD setting. Saved TEST order/payment recovery remains available.
- The private buyer screen identifies Stripe TEST, TD SYNNEX sandbox/UAT and supplier submission held. It reports pricing preparation separately from an actual supplier quote. Customer views contain no credential names/values or supplier acquisition cost.
- Supplier submission is held. Ordinary builds run local checks and tests; provider probes and webhook/setup maintenance are separate explicit opt-in commands. The two scripts referenced by the old deployment but absent from source (`probe-desktop-freight.mjs`, `prepare-account-checkout.mjs`) were not fabricated or run.

## Provider evidence and unresolved inputs
The existing October 30 checkpoint documents a successful dedicated UAT OAuth and one product read. Do not repeat the earlier invalid-client diagnosis or rotate credentials based on older mail. The provider confirmed UAT orders are non-billable, but that does not confirm absence of physical shipment. No provider-confirmed UAT currency, synthetic ship-to/contact, or selected shipping method was found. The provider-suggested lock SKU is not evidence of Lenovo UAT availability. Do not substitute products silently.

UAT USD confirmation remains unset. No PO, actual checkout payment, refund, mail or supplier-status reconciliation was executed in this continuation. Local synthetic test transport responses are not actual TD or Stripe transaction proof. A READY deployment alone is not launch readiness.

## Validation and deployment
The full local `npm run build` passed: 1,433 tests, 1,423 passed, zero failed, ten optional hosted tests skipped. All JavaScript syntax, static build, internal-link/SEO, public-boundary, partner-page, address, blog and final theme checks passed. These tests use synthetic transports; no hosted storage diagnostic or actual provider transaction was executed. `node scripts/verify-checkout.mjs` also passed all three complete rounds (serial and two deterministic randomized orders): each had 1,433 tests, 1,423 passes, zero failures and ten optional hosted skips. The saved code commit is `68628185dfb124ef5c05021f6c9a478cc846ea5d`, with verified source tree `cfbdae923ae5f1f2517d481692687e966c4b64e6`. The remote tree matched the staged tested source exactly. GitHub branch movement was independently read back; main remained `7dfdb3c67b2cd51562aa3da19ad0629397474c9b`.

Preview-only branch settings were saved and independently read back: `TP_MARKETPLACE_TD_SANDBOX_ONLY=true`, `TP_TD_UAT_SUBMIT_ENABLED=false`, `TP_TD_UAT_PILOT_APPROVED=false`. `TP_TD_UAT_ACCOUNT_CURRENCY` remains absent. Production settings were not changed.

## Verified private deployment
Vercel deployment `dpl_8Z1oEvHL6R9gbKvW7X26pteLCnA2` independently reported READY from the saved code commit on `feature/td-product-controls`, with Preview target and the existing private branch alias. Vercel build logs independently reported the same 1,433-test / 1,423-pass / zero-failure / ten-skip result. Existing project protection remains enabled for previews. Draft PR 23 remains open, draft and unmerged; its base branch was not changed.

Review URL: https://tri-point-government-solutions-bcstv3gji-tri-point.vercel.app/marketplace/account

The signed-in Vercel browser session opened the protected page and reached the Clerk development test-account sign-in form. Deployed page DOM contains the Stripe TEST, TD SYNNEX sandbox/UAT and held-submission labels. No application account sign-in was performed, so authenticated configuration/UI and an actual product quote/payment were not verified in the browser. The held configuration and preserved saved-order recovery are covered by the local synthetic tests. Do not describe them as actual provider transaction evidence.

This deployment checkpoint is a documentation-only follow-up to the verified code deployment; the code deployment above remains the review reference.

## Next action
Review the private preparation screen. Obtain explicit TD UAT currency confirmation before enabling genuine pricing/payment progression. Keep submission held until separately authorized with provider-approved test destination/contact/service, nonphysical fulfillment assurance and existing exact-order controls satisfied. Reconcile any uncertain historical provider attempt rather than retrying it.
