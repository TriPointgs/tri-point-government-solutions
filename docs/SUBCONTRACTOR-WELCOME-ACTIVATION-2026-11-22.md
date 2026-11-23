# Tri-Point subcontractor welcome-email activation — preparation checkpoint (2026-11-22)

## Request and release boundary
The owner requested preparation for activating automatic welcome emails. The separate review/approval flow is already published. This checkpoint **does not activate** real applicant delivery; the reviewed template, controlled test, and dedicated key remain prerequisites. There is no authorization here to send to an unselected real subcontractor or to backfill mail to previously approved profiles.

## Verified platform facts
- The connected Resend inventory shows send.tripointgs.com **verified**, sending enabled, with click/open tracking disabled.
- A separate Tri-Point transactional key exists for other website workflows, but the dedicated subcontractor-welcome key is absent. Do not repurpose keys from another workflow or business.
- The Production settings were created and independently must be checked after deployment:
  - TP_SUBCONTRACTOR_WELCOME_FROM = network@send.tripointgs.com **proposed, awaiting owner confirmation**
  - TP_SUBCONTRACTOR_WELCOME_ENABLED = false
  - TP_SUBCONTRACTOR_WELCOME_APPROVED = false
  - TP_SUBCONTRACTOR_WELCOME_API_KEY = **absent**
- The sender domain has not been tested from the proposed network address. Do not claim actual sender mailbox delivery.
- This is separate from the general new-application notification to Tri-Point and separate from customer order emails.

## Safe code hardening
- A dedicated reply_to address of info@tripointgs.com is applied, so the sending-only subdomain does not need an inbound mailbox.
- An exact private-record reread confirms the exclusive attempted state after durable compare-and-swap and **before** the Resend POST. If it cannot be verified, no send is attempted and no automatic retry occurs.
- The existing feature requires Production plus both explicit flags, a validated domain sender and its own dedicated API key, and then uses the saved application email only for an approved company.
- Approval does not mean certification, verified qualifications, a contract award or guaranteed work. Repeated or ambiguous email sends are not retried.

## Verification
Code review and full clean production-mode build completed: 311 automated tests passed, zero failures; protected HTML routes and inactive checkout boundaries passed. No live Resend welcome email, real subcontractor approval, Production credential change, supplier order or payment occurred during testing. Record the deployment status only after inspecting Vercel against the exact commit.

## Required next steps
1. Owner confirms the proposed network sender and the actual welcome message text (review in /contractors/admin).
2. Create in Resend a **dedicated Sending Access** key restricted to the verified Tri-Point sending domain. Secret is shown once; store it directly in Vercel Production under TP_SUBCONTRACTOR_WELCOME_API_KEY as a sensitive/Secret value. Do not paste it in chat, GitHub or email.
3. Run one explicitly approved controlled delivery to the owner/test mailbox; check sender authentication, provider receipt and inbox message. This is different from a real app-linked approval test.
4. Run a protected application-level end-to-end test using an owner-approved synthetic recipient/order (no real subcontractor), proving persisted one-shot state and correct real provider payload.
5. After evidence and final owner consent, turn on both flags with a deliberate new production deployment. Future real approvals then send automatically. Previously held notices require individual review and sending; no bulk backfill.

## Rollback
Preserve the previous production commit for rollback. Do not modify unrelated website, authentication, commerce, marketing or supplier integrations.
