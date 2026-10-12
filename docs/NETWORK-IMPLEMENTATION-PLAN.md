# Subcontractor Network — Sectioned Implementation

Audit baseline: main c87875e2e1e88f14fada0540e9505782066c33b6; production dpl_8hZeiSqfSo777DhdFg2PDZep9mJU. Audit date: October 11, 2026 (Eastern).

## Baseline correction
The private Opportunities workspace, profile-aware drafts, manual send approval, response tracking, pending profile corrections and controlled Command Center profile sync already exist. Do not replace them from an older specification. The public sourcing/training pages are legacy content that conflicts with the current business model.

## Section 1 — Public boundary and signup
Remove sourcing/training pages from the deployed output, public bid-search/learning links, prime/teaming/training signup options and educational-newsletter enrollment. Preserve the agency homepage, application receipt/referrals, private directory, protected opportunity APIs and stored records. The form introduces a subcontractor; old consent records are not rewritten. Retired resources return 410. No paid product or paywall is launched.

Implementation: a fail-closed final build stage strips retired resources and replaces the contractor presentation. This avoids changing the working application APIs or private storage during the content cleanup. Assertions guard template assumptions, county serialization, retained consent and existing internal routes. Legacy generator source is retained for rollback but its retired output is removed before deployment. Historic public repository copies are not made private by this change.

Gate: complete all existing tests, public boundary tests, generated-link and sitemap checks, preview content and authorization checks before production. No production records or real outreach used for testing.

## Section 2 — Private records and matching
Build on the existing workspace. Confirm structured imports, private requirement/review/disclosure separation, manual selection and complete-pagination indicators. Strengthen geography uncertainty, total crew versus project-available staff, and changed/unverified information. Preserve V5.0 sync allowlist and read-only behavior. No automatic bot source, supplier or bid actions.

Gate: unknown values are not represented as verified or available; cross-state county matches do not masquerade as fit; re-verification is visible; legacy tests pass.

## Section 3 — Profile-aware outreach approval
Use only staff-approved disclosure and the selected contractor's own relevant profile. Ask for project-specific confirmation. Review exact recipient, subject and body. Preserve stale-draft checks, send reservation/idempotency and fail-closed preview. Do not enable delivery without an explicitly configured verified production sender.

Gate: confidential canaries absent; individual manual recipients; unselected/no-consent/stale profiles cannot send; preview cannot contact a real provider. No real outreach during testing.

## Section 4 — Responses, quotes and reviewed corrections
Exercise and improve existing statuses, project confirmations and pending permanent-profile corrections. Preserve evidence, history, re-verification and optimistic concurrency. Total company staff and staff available for a job remain separate. Staff-entered replies are not automatic mailbox ingestion. Reconcile uncertain delivery rather than retrying blindly.

Gate: proposals do not mutate profiles; approved corrections preserve internal/verified records and receive an audit; conflicts cannot overwrite later changes; status changes never send email.

## Section 5 — Own-profile accounts and launch measurement
Separate future release: verified profile claim, own-profile authorization, account recovery, expiration reminders and abuse protection. Contractors see only their own profile, never opportunities, source links, matches, other companies or pipeline. Recruitment and search measurement follow confirmed conversion and approved communications. Paid education remains separate and is not advertised as available.

## Release discipline
One section per reviewable commit; run all regressions, validate preview, preserve rollback and then deploy production. Synthetic tests only. Do not change existing production credentials, billing, automatic import or procurement actions. Older operations/growth documents describe an earlier release; their public training/opportunity language must not be reused in recruitment.
