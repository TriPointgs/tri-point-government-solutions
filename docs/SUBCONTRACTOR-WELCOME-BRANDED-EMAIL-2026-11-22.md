# Tri-Point subcontractor welcome email — owner branding (2026-11-22)

## User-approved appearance
- The exact owner-uploaded SVG logo is preserved at assets/subcontractor-welcome-logo.svg, SHA256 7c7f1f35bf2d84b05aa5389ab319ad389305b15f6a8d17cb0c81f40183918f5d. This is not an inferred or substitute brand image.
- An email-client-compatible transparent PNG is stored at assets/subcontractor-welcome-logo.png, 820x166, served at https://tripointgs.com/assets/subcontractor-welcome-logo.png after publication. The HTML email references the absolute HTTPS PNG URL. Do not assume SVGs display in every inbox.
- Header displays the uploaded logo on a white background with Tri-Point navy/gold accents; plain text is always retained for blocked images or text-only recipients.
- Exact owner-requested signature: **Adriel Lorenzo**, **Founder | CEO**. Reply routing remains info@tripointgs.com.
- The welcome subject, application approval disclaimer and cautious own-profile instructions are retained. User-supplied company names are HTML-escaped. The email contains no external scripts, tracking pixels, marketing promises, private opportunity data or unrelated assets.

## Delivery boundaries and verification
- No welcome email was sent during the logo/template work. This is a content/template change only.
- Production had TP_SUBCONTRACTOR_WELCOME_ENABLED=false and TP_SUBCONTRACTOR_WELCOME_APPROVED=false at the time of the change; keep both off. Resend sending domain remains separately verified.
- TP_SUBCONTRACTOR_WELCOME_API_KEY appears as a sensitive Production variable in Vercel, but the value was not retrieved, displayed, copied, or tested here. Mere presence does not establish credential correctness or enable delivery.
- Visual checks of rendered HTML at 390px and 720px verified logo image load, no horizontal overflow, correct heading and signature, and no page errors. Unit tests verify exact owner logo source SHA, PNG size/dimensions, plain-text and HTML fallback, HTML injection escaping, and Resend's proposed payload formatting.
- Do not claim inbox delivery from browser, build, or provider configuration checks. A controlled provider/mailbox test requires separate approval and reconciliation; only then consider enabling automatic notices.

## Rollback and next action
Use the previous production commit for rollback. Before an actual email send: confirm the final HTML preview and exact sender, independently verify the production key's restricted access, test with an approved mailbox through the real application, reconcile delivery/authentication, then explicitly authorize enabling both Production flags. Never send or backfill messages to actual subcontractors as part of this template-only change.
