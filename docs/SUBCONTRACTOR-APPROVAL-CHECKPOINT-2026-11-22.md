# Subcontractor network approval and held welcome email — 2026-11-22

## Owner-requested scope
Build an independent administrator approval/decline step after existing Mark reviewed, and a future automatic welcome email. Do not activate sending before the owner reviews the message and a controlled delivery check succeeds. No specific real subcontractor was authorized for approval in this change.

## Decisions and transition rules
- Existing new -> reviewed (displayed Under review) remains a separate action with no email.
- reviewed -> approved requires an administrator session, correct Origin, an exact expected prior status, explicit confirmation, positive network consent and a valid applicant email. The private profile records approvedAt, a staff-only decision entry, and a held welcome-email notice. Approval does not verify licensing, insurance, certifications or eligibility, and does not guarantee work.
- reviewed -> declined records declinedAt and decision history, with no decline email. Declined applications are excluded from own-profile sign-in/claim.
- Approved/declined decisions cannot be repeated or overwritten with this workflow. Private Blob conditional writes prevent stale concurrent decisions. Older reviewed profiles remain reviewed until manually approved; this does not backfill approvals.
- Administrator can preview the actual proposed welcome subject/body and recipient without sending. Client renders the preview as text, not trusted HTML.
- Approvals never submit supplier orders, change payment status, or disclose private opportunities.

## Email isolation and release gate
- The Resend welcome adapter exists but is OFF by default, including all Preview environments. It requires all of the following in Production:
  TP_SUBCONTRACTOR_WELCOME_ENABLED=true, TP_SUBCONTRACTOR_WELCOME_APPROVED=true, a separately scoped secret TP_SUBCONTRACTOR_WELCOME_API_KEY and a verified TP_SUBCONTRACTOR_WELCOME_FROM under tripointgs.com.
- None of the four welcome-specific variables were configured when inspected on November 22. No recipient emails were sent or authorized by the implementation request. This is distinct from new-signup alerts sent internally to Tri-Point.
- When separately activated, a new approval can automatically attempt a single welcome email. The protected admin can also initiate a one-time send of a previously held welcome after separately reviewing it. The private record is conditionally marked attempted before contacting Resend. The provider idempotency key is stable per company approval, and the system never automatically retries an ambiguous attempt.
- provider-accepted means Resend accepted a send request, not proof of inbox delivery or human receipt. A provider failure, timeout or uncertain result is recorded for manual reconciliation and is never treated as successful delivery.

## Verification and release
Review the current GitHub commit and live Vercel READY status before calling this released. The full test suite, security/approval tests, generated HTML and desktop/mobile administrator browser interactions must pass. Use the preceding main commit for rollback. Do not publish credentials or any real company data in this repository.

## Next milestone requiring explicit owner authorization
Review the preview text, confirm the mail sender/domain and policy, securely configure the gated provider credential in Vercel, carry out a narrowly approved test using a synthetic record, verify receipt and provider response, and only then consider activating automatic real-subcontractor notices. Production rollout of the workflow is not authorization to send notifications to any existing company.
