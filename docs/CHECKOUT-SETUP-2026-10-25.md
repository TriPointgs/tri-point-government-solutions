# Checkout setup workspace — October 25, 2026

## Baseline and scope
Repository: TriPointgs/tri-point-government-solutions. Branch: feature/td-product-controls; draft PR 23. Verified starting head/rollback: 03e9fcc6a4cc08a6d18e718b4dc7680bf574986f. Main observed at start: c61404dcd184b5c1e43a40b73e86c740b4ee375a. No main merge or production release is part of this change.

The user requested continued checkout development and repeated testing. This stage turns remaining owner decisions into an actionable private setup workspace rather than inventing decisions or repeatedly reporting the same blockers. It does not implement public buyer accounts or launch live checkout.

## Implementation
`/admin/checkout-setup` is linked from the existing checkout page and launch center. It uses the existing shop serverless function, administrator authentication, same-origin write check, rate limits, no-store/noindex and preview-only routing.

The workspace prepares exact proposed purchase/return/cancellation/warranty text and version, shipping policy notes, tax/exemption review notes, a proposed guest/account/both choice, and up to 100 exact TD SKU/manufacturer-part/tax-code rows. It starts empty. No universal return window, tax registration, zero-tax exemption, shipping promise or product tax classification is supplied as fact.

Drafts use a separate account-scoped `preview/checkout-setup/v1/<hash>/draft.json` namespace. There is no code path writing approved merchant-policy.json, payment flags, identity state or environment variables. Fully populated sections still report `approved: false` and `checkoutActivated: false`. Existing configuration blockers are reported separately from draft completeness. A direct test confirms the finalizer's approved-policy reader cannot see this draft.

Draft writes are revision-checked, conditionally stored with the existing strong-ETag reader, and independently read back before success is returned. The same request identifier recovers an uncertain save; a new editor's later version is never silently overwritten. Exact proposed terms text is retained. Common credential formats are rejected without echoing them, and the page warns against secrets, customer data and tax IDs/documents. This is not a comprehensive DLP guarantee.

The user can save partial drafts and export only the saved revision as a JSON review packet. The UI hides export while local edits or uncertain writes exist, preserves the same retry payload in memory, locks editing while a save is unresolved, and requires explicit confirmation before replacing local content with the saved draft. Nothing is persisted to browser localStorage. Input text is inserted as text/value, not executable HTML.

## Tests
New service, storage and route tests cover validation, unknown approval fields, limits and oversized streams, credentials, missing/hostile origin, unauthorized roles, production refusal, merchant isolation, strong-ETag writes, corrupted stored content, lost replies/readbacks, twenty concurrent editors repeated ten times, export, and draft/approved-policy separation.

`scripts/verify-checkout-setup-browser.mjs` exercises the actual local HTTP handler with synthetic Secure/HttpOnly/SameSite=Strict admin cookies in separate desktop (1440px), mobile-touch (390px) and keyboard-tablet (768px) Chromium processes. All three passed form editing, literal HTML-like text, exact draft export, a damaged response after a committed save, same-payload recovery and conflicting second editors. Zero script errors and uncontrolled external requests; no document horizontal overflow. No actual Stripe/TD calls.

The initial dropped-socket fixture did not reliably expose a failed response because the browser could recover it. The fixture now returns a deliberately unreadable response after the write, deterministically exercising uncertainty without changing application code or weakening the retry assertions. A pasted tax-code test exposed whitespace being counted before validation; identifiers are now trimmed before their strict length/format check. The missing-Origin test fixture was corrected to actually omit the header rather than invoke its default trusted value.

`tests/checkout-setup-hosted.test.mjs` is opt-in only on the exact branch with `TP_BLOB_STORAGE_CANARY=diagnose`. It uses a unique disposable namespace and synthetic merchant, verifies real Blob roundtrip/replay/conflict/isolation, and requires verified cleanup. Do not claim this hosted test passed before inspecting the deployment log.

The existing complete-suite repeat runner and existing checkout browser runner are reused. Hosted counts, final deployment status and diagnostic cleanup must be checked after the commit. Independent AI review remains unavailable as established previously; browser/process tests are not described as independent agents.

## Context correction
`docs/MARKETPLACE-OWNER-DECISIONS.md` previously said Stripe was unselected and proposed authorization-before-capture. It is reconciled with the established selected Stripe TEST integration and captured-before-supplier requirement. Unapproved business policies remain clearly unapproved.

## Remaining work
Prepare and review actual merchant decisions using this workspace; publish approved configuration only through a separately reviewed action. Public buyer access, approved terms/shipping/tax settings, the real product-linked hosted sandbox pilot with event delivery, independent review and explicit production authorization are still outstanding. Saving a proposed buyer-access choice does not create customer accounts. No additional fixed-$20 payment is needed for this work.
