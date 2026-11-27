# Checkout acceptance and hardening — October 25, 2026

## Source, scope and definitions
Baseline/rollback: `4c2f732ead79993bdee92d0e596ef79a48fce14d`, `feature/td-product-controls`, draft PR #23, TriPointgs/tri-point-government-solutions. Scope is the existing administrator-only, browser-owner-scoped TEST checkout. This work does not introduce public buyer accounts or approve merchant terms, tax policy, shipping policy, product eligibility, refunds, supplier orders, production publication or real payments.

The user requested checkout completion and repeated testing, including different agents. Connected plugin searches, GitHub agent-tool discovery, and runtime agent CLI discovery found no executable independent coding-agent runner. A separate Composio tool discovery also failed authorization (401). No independent AI review was executed or claimed. The different test processes, seeded test orders, desktop/touch/keyboard browser runs and adversarial tests described here are actual executable tests, not different AI agents. Independent human/agent review remains a separately identified release requirement.

## Proven defects repaired
Six focused tests failed on the baseline and passed after fixes:
1. Pausing NEW checkout no longer blocks existing owner order reads, history or payment reconciliation. Production and disabled verifier/finalization guards still apply.
2. A failed canonical Checkout Session read durably clears prior payment approval; refreshing the page cannot restore stale success within its old freshness window.
3. Mismatched Session identity/amount similarly clears old approval instead of treating the last successful response as current truth.
4. Retries across preview deployments retain the original return origin and request parameters under the same Stripe idempotency key.
5. Expired Session observations are saved, visible in history and remain closed after reload.
6. A newly created Session must match the exact metadata/flow/card-only restriction before its URL is returned.

Additional work:
- Server-verified Checkout Session observations are durable and terminal paid/expired observations cannot silently revert.
- Explicit unpaid sandbox Session expiry is implemented behind the separate `TP_STRIPE_TEST_CHECKOUT_EXPIRY_ENABLED` switch, unchanged/off unless separately authorized. Consent and original owner are required. Completion winning the expiry race is recorded as paid, never canceled; no refund is requested.
- Signed `checkout.session.completed` and `checkout.session.expired` events are validated, then reconciled through authenticated provider reads. A signed event alone is not payment proof.
- If Stripe created a Session but its local save failed, a signed matching payment can recover exactly one existing Session by PaymentIntent, validate the original merchant/order/quote/time/amount and reread the canonical Session. It never creates a replacement payment, moves the quote expiry or manufactures an absent order.
- An administrator-only `/admin/checkout-recovery` page reads/rechecks an exact existing order after the original browser cart cookie is lost. It does not transfer owner identity or expose contact/payment identifiers, does not accept paid/totals overrides, requires explicit recovery consent for writes, and preserves CSRF, rate limits and production refusal.
- A visible full recovery order UUID is provided on the checkout page.
- Payment-event function duration is explicitly 60 seconds to accommodate bounded server/provider checks.

## Dependency security
A fresh production-dependency audit initially reported five high-severity affected package entries, arising from vulnerable transitive Undici and Zod dependencies. No blanket `audit fix --force` or storage-SDK downgrade was used. `@vercel/blob` remains 2.8.0 and Stripe remains 23.0.0. Scoped overrides pin its Undici dependency to 6.29.1 and @vercel/cli-config's Zod to 4.6.6; the lockfile was regenerated and a clean npm ci rerun. The patched npm audit reported zero known vulnerabilities at test time. This is not a claim of universal security or a penetration-test certification.

Primary security references: GHSA-4qv8-2p9j-2685 and GHSA-xjj6-f33q-929c (nodejs/undici), GHSA-mrhx-c7xc-m3w5 (Zod). Node sandbox runtime was 24.22.1 with built-in Undici 7.30.1, independently printed. Hosted runtime and real Blob behavior must also be checked in the gated acceptance build.

## Reproducible tests
`node scripts/verify-checkout.mjs` runs the ENTIRE suite in three independent processes: concurrency 1; concurrency 4 with seed 20261025; concurrency 8 with seed 7319. It disables all remote-storage diagnostic gates for repeatability, saves per-run logs and a JSON report under a temporary directory, and rejects malformed/incomplete summaries.

At the latest local stage, each of these three runs passed 1,036 tests, zero failed, with five intentionally skipped opt-in storage diagnostics (1,041 total). Earlier full baseline/serial/random runs also passed after their respective incremental changes. Final counts and commit must be verified again after any additional modifications.

New adversarial coverage includes 25 repeated three-way browser/payment-event/history races; 10 adverse-event/recheck races; five simultaneous finalizations repeated 10 times; provider timeouts; lost create/save/expiry replies; metadata and amount tampering; unknown/duplicate/truncated recovery results; missing owner cookies; unauthorized roles and cross-origin requests; future-dated evidence; and refunds/disputes. No positive payment or supplier approval is manufactured to make tests pass.

`node scripts/verify-checkout-browser.mjs` runs three fresh Chromium processes (desktop 1440px, touch mobile 390px, keyboard tablet 768px). Install @sparticuz/chromium and playwright-core into an isolated Linux `TP_BROWSER_TOOLS` folder; default /tmp/tp-browser-tools. Its real local HTTP handlers use synthetic providers and actual Secure/HttpOnly/SameSite=Strict synthetic cookies. Navigation leaves the merchant origin for an intercepted mock Stripe page and returns through the real data-free return hop. It also removes the original cart cookie and validates administrator recovery. It checks keyboard and consent behavior, exact totals, no automatic payment approval, pause/recovery, failed-check reload, stale quotes, expired checkout reload, pagination and overflow. All three passed with no script errors, no uncontrolled external requests and one mock Session each. No real Stripe network call occurred.

An initial browser harness attempted several contexts inside the packaged single-process Chromium and lost the browser when a context closed. The harness was corrected to launch a fresh browser process per scenario; application behavior was not weakened to hide the environment failure. A mocked Session-list test also lost its `this` binding; the wrapper was bound correctly and original strict assertions retained.

## Hosted verification gate
`tests/checkout-hardening-hosted.test.mjs` is opt-in only on the exact feature branch and `TP_BLOB_STORAGE_CANARY=diagnose`. It uses real Blob storage under a unique disposable prefix with injected synthetic Stripe/TD/tax, checking durable expiry, failed-check invalidation, recovery of lost Session saves, administrator recovery, paused-creation history and cleanup. All paths are scoped; no existing business record is read or changed. Do not claim this test passed until its build output and success are verified. Restore the diagnostic flag to off after verification. Do not enable the expiry or commercial creation flags.

## Completion and release gates still outstanding
The implemented technical scope is private merchant TEST checkout, not live public ordering. Missing reviewed inputs must not be fabricated to turn it on:
- Actual versioned customer purchase/returns/cancellation/warranty terms and approval evidence.
- Customer shipping destinations/charges/partial-shipment policy (a distributor free-freight benefit is not automatic customer policy).
- Reviewed tax registrations/settings, exact product tax classifications, and exemption-review process.
- An approved permanent customer identity/account model; current history is browser-session scoped plus separate administrator recovery.
- Explicit activation and an authorized real hosted product-linked sandbox pilot, including provider event subscription/delivery.
- Independent agent/human review, production reconciliation and separately authorized release.

No new payment, refund, supplier PO, customer email, production release, unrelated branding change or personal-memory write is part of this task. The existing successful fixed-$20 capture/persistence screenshot remains valid evidence for that earlier test only.
