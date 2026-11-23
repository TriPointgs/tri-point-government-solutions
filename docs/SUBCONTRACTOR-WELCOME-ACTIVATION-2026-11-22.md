# Tri-Point subcontractor welcome emails — live checkpoint (November 23, 2026)

## Current verified state
The owner approved the latest delivered preview and explicitly authorized automatic welcome emails when they approve applications. This supersedes earlier preparation instructions to keep welcome sending disabled or obtain another template approval.

- Production TP_SUBCONTRACTOR_WELCOME_ENABLED and TP_SUBCONTRACTOR_WELCOME_APPROVED were each set to true and independently read back as true.
- TP_SUBCONTRACTOR_WELCOME_FROM remains network@send.tripointgs.com; reply-to remains info@tripointgs.com.
- The dedicated TP_SUBCONTRACTOR_WELCOME_API_KEY is present as a sensitive Production variable. Its secret was not read, decrypted, copied or changed.
- Redeployment dpl_4Dutra7rQDHaV13gyj4XfQ7X3WJK independently reported READY, Production, source ddfc83ae26de35bba8273185d54c733919fc448b, tripointgs.com/www aliases, and no alias error. This retained the newer public indexing work.
- An authenticated, read-only GET of the live /api/notifications returned welcomeEmailEnabled=true. No application decision or send operation was invoked during activation.

## Approved appearance and test evidence
The current welcome email uses the exact latest uploaded transparent logo on a white panel within the navy/gold header, with Adriel Lorenzo and Co-Founder | CEO below. See SUBCONTRACTOR-WELCOME-BRANDED-EMAIL-2026-11-22.md for exact asset and source checks.

The standalone preview was sent to the owner's selected test mailbox, independently reported delivered by Resend, and found in the inbox by its exact RFC message reference. The owner then approved it. Private recipient/message identifiers remain in the authorized mail systems, outside this public repository.

That preview used the connected provider tool, not the deployed application's dedicated credential. The activation flag and runtime response establish that the application is enabled; they do not establish a completed application-linked provider send or credential correctness. Do not invent a successful applicant delivery.

## Current user action and scope
The owner will approve the selected application through /contractors/admin. For an application under review, the existing confirmed approval saves approved status and then triggers one welcome-email attempt. The existing workflow requires network consent and a valid applicant email. This activation does not approve any application, create test records, backfill held notices, send to existing applicants, or enable unrelated marketplace/customer email flows.

A pre-provider conditional claim and readback protect the one-attempt workflow; provider idempotency is additional protection. Approval is not certification, verified qualifications, a subcontract award, or guaranteed work. Uncertain outcomes require reconciliation, not an automatic resend. A later held-welcome action is separately scoped to one reviewed record.

## Rollback and remaining verification
To disable future welcome attempts, set both welcome flags to false and deploy again. Source rollback alone does not undo Production environment changes. The immediate prior deployment is dpl_BAvpmjhgPurfdpgALxktEx1SRova at the same source commit, before the flag activation; an environment rollback must still be deliberate.

Remaining evidence: the owner's first actual application approval, saved welcome state/provider reference, and recipient delivery. Do not approve or send an application merely to collect that evidence without the owner's specific instruction. No new email was sent by this activation.
