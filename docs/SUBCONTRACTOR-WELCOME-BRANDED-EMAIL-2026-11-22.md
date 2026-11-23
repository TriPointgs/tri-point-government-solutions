# Tri-Point subcontractor welcome email — owner branding (2026-11-22)

## User-approved appearance
- The current exact owner-uploaded transparent PNG logo is preserved at assets/subcontractor-welcome-logo-transparent.png, 2048x414, SHA256 60c816bfd858813f9af358cff0763ebf94f6fac16b103ead8e5951e02d56c431. This is the latest November 23 upload, copied without image modification.
- The HTML email references https://tripointgs.com/assets/subcontractor-welcome-logo-transparent.png at the top, on a white panel inside the navy header with a gold lower border. Inline background and bgcolor explicitly set the logo's white background, preserving contrast for its navy lettering. PNG is used for email-client compatibility.
- Earlier logo assets remain available for existing uses. Plain text is retained for blocked images or text-only recipients.
- Final owner-requested signature (November 23, 2026): **Adriel Lorenzo**, with **Co-Founder | CEO** underneath in both HTML and plain text. Reply routing remains info@tripointgs.com.
- The welcome subject, application approval disclaimer and cautious own-profile instructions are retained. User-supplied company names are HTML-escaped. The email contains no external scripts, tracking pixels, marketing promises, private opportunity data or unrelated assets.

## Delivery boundaries and verification
- No welcome email was sent during the logo/template work. This is a content/template change only.
- Production had TP_SUBCONTRACTOR_WELCOME_ENABLED=false and TP_SUBCONTRACTOR_WELCOME_APPROVED=false at the time of the change; keep both off. Resend sending domain remains separately verified.
- TP_SUBCONTRACTOR_WELCOME_API_KEY appears as a sensitive Production variable in Vercel, but the value was not retrieved, displayed, copied, or tested here. Mere presence does not establish credential correctness or enable delivery.
- Prior November 22 visual checks at 390px and 720px concerned the earlier logo/header. Current tests verify the exact new owner PNG hash/dimensions, dark header, HTML/plain-text signature, HTML injection escaping, and the proposed provider payload. Those checks are not inbox-rendering certification.
- Do not claim inbox delivery from browser, build, or provider configuration checks. A controlled provider/mailbox test requires separate approval and reconciliation; only then consider enabling automatic notices.

## November 23 white-logo header update
- The owner confirmed that the API key had already been saved in Vercel and deployed. A live deployment read found Production READY at `973d35d03f902d27c18cafaa6891235f8156c8c3`, including the logo/header and earlier Founder title. That commit is the rollback for this correction.
- Applied the uploaded white logo above the body on a navy header, retained `Founder | CEO`, and adjusted existing branding/payload assertions. No transport, recipient, delivery flag, or credential setting changed.
- Full build passed with 315 tests, zero failures, and the public/private boundary checks. The browser checks listed above are historical; a new local rendering attempt was blocked by the environment's browser socket restriction, so no new visual or inbox-delivery result is claimed.
- Next action: verify the deployed commit, then separately arrange any controlled email delivery check. No email was sent by this correction.

## Rollback and next action
Use the previous production commit for rollback. Before an actual email send: confirm the final HTML preview and exact sender, independently verify the production key's restricted access, test with an approved mailbox through the real application, reconcile delivery/authentication, then explicitly authorize enabling both Production flags. Never send or backfill messages to actual subcontractors as part of this template-only change.

## November 23 final title approval
The owner reviewed the single requested preview email, confirmed the design looks good, and requested only the title change to `Co-Founder | CEO`. Both HTML and plain text now use that exact title. The standalone preview was independently reported delivered and found in the intended inbox; it does not establish application-level delivery or authorize automatic applicant mail. No new email or delivery-setting change is part of this title correction. Rollback: `3f7d9806826d8c5e8e96c1eede0c6e673384471e`.

## November 23 latest transparent-logo selection
The owner supplied TriPoint_Logo_Transparent.png for the welcome email. The exact uploaded bytes now replace the white-lettered logo in this template. A white panel keeps the navy lettering readable while retaining the surrounding navy/gold header. The final `Co-Founder | CEO` signature remains unchanged. No additional email or delivery-setting change is part of this logo update. Rollback: `b85e30c33b47ebc32a3fce78cd7f790778cd5e12`.
