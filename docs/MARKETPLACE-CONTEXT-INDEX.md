# Marketplace context index

## Stable workflow and boundaries
Tri-Point Government Solutions; repository TriPointgs/tri-point-government-solutions. Continue scoped work on feature/td-product-controls / draft PR 23. Verify current refs and deployments before changes; do not infer success from an earlier assistant response. Keep main, production, unrelated branding and Wasabi work untouched unless separately authorized. Never store credentials/customer records in this public repository. Captured payment, not authorization alone, precedes any supplier-release design. Repeated whole-suite and differing browser tests are requested; never call test workers independent AI agents.

## Current project state — start with these sources
Read `docs/CHECKOUT-SETUP-2026-10-25.md` for the new private merchant setup workspace. Consult live GitHub/Vercel for its deployment evidence; local implementation notes are not proof of deployment. Read `docs/CHECKOUT-VERIFIED-2026-10-25.md` for the prior verified checkout milestone and `docs/CHECKOUT-ACCEPTANCE-2026-10-25.md` only for detailed failure-recovery work. `docs/MARKETPLACE-OWNER-DECISIONS.md` separates decided payment flow from unapproved merchant inputs.

## Decisions versus proposals
Selected: Stripe TEST integration, captured-before-supplier requirement, existing 15% default markup (not proof of total order profitability). Still unapproved: purchase/return/cancellation/warranty terms, customer shipping policy, tax registrations/classifications/exemption review, public guest/account access and live release. New setup drafts are preparation only, never approved policy or activation. Browser-session history plus administrator recovery is not a permanent buyer-account system.

## Focused workflows
Implementation: read AGENTS.md; inspect PR 23/current head; use existing shop/checkout routes and private storage boundaries. Repeat `node scripts/verify-checkout.mjs`. Test checkout via `scripts/verify-checkout-browser.mjs`, and setup via `scripts/verify-checkout-setup-browser.mjs` with isolated browser tools. Keep hosted storage diagnostics opt-in, synthetic and disposable; inspect cleanup and restore the diagnostic flag to off. Save a verified checkpoint after deployment. Solicitation and unrelated personal/business history are not needed for this workflow.

## Verified reusable lessons
A browser return is not payment proof. Retry the same order/request after uncertainty. Preserve strong storage versions and use no-cache private reads for conditional writes. Do not weaken checks to make fixtures pass. Readiness, configured services, approved policy, hosted pilot and production release are different facts. No independent-agent completion may be claimed without an actual agent invocation/result.
