# Website feedback fixes — October 19, 2026

Status: preview implementation; production remains unchanged. Parent review commit: `2f9dc5972e6a31fa823f0641912949988307f674`, draft PR #22.

## Scope requested

The owner approved the redesign, reported nonfunctional Lenovo/Fortinet Email Tri-Point and Request a Quote buttons, requested a replacement logo integrated into the site, and reported an incomplete concern about a test subcontractor signup. The supplied screenshot shows a saved application and a blank destructive-action button. The owner has been asked to finish the signup complaint; no unconfirmed missing behavior is treated as a verified bug.

## Contact and quote flow

The affected links were `mailto:` links, which require an email handler. Customer-facing contact links now lead to `/contact`. Lenovo and Fortinet actions preselect the appropriate manufacturer. The marketplace request list transfers its item descriptions and quantities to the same on-site form.

The new `/api/contact` saves a validated inquiry in a separate private contact-inquiry collection, returns a reference, and never exposes the inquiry collection to anonymous users. The form uses a signed, purpose- and environment-bound challenge, same-origin checks, rate limits, a honeypot, input limits and explicit contact consent. It rejects caller-provided recipients, internal states and arbitrary fields.

The authenticated `/admin/inquiries` workspace lists, opens and marks inquiries reviewed. It never approves a quote, creates an order or sends a manual email. Stored records and operational email outcomes are tracked separately. Duplicate form retries with unchanged content do not create new records; changed content under the same reference is rejected. Internal alert claims use compare-and-swap, and uncertain sends are not blindly retried.

Preview requests are marked test and cannot send email, even with production-looking flags. Production intake requires `TP_CONTACT_INTAKE_ENABLED=true`; production internal alerts require a separate `TP_CONTACT_EMAIL_ENABLED=true`, an approved sender at `send.tripointgs.com`, and the existing Resend credential. No configuration values or release flags were changed during this work. No live provider message was sent. Automatic customer confirmation emails are not introduced.

## Logo and display corrections

A new self-contained, transparent SVG wordmark is installed at the existing `/assets/tripoint-logo.svg` path. Matching reversed artwork is used in the footer, and an icon-only mark is used as the favicon. The exact company name remains Tri-Point Government Solutions LLC. Existing third-party partner emblems and email-signature assets are not changed. No fake telephone number, new manufacturer authorization, or generated concept-page feature is introduced into the site.

The blank screenshot control is the existing Delete this application button. Its label was white on white because the new shared button selector overrode the old danger-button color. The patch restores explicit red-on-white text and a readable hover state. Confirmation before deletion remains intact. The owner’s application was not deleted, edited, marked reviewed, or copied into a test fixture.

## Subcontractor signup clarification

The existing signup flow saves the profile and shows an on-screen reference. It does not send an applicant welcome/confirmation email or automatically create an account. Staff signup email alerts remain production-only. The preview signup form, receipt and administrator notification area now distinguish these behaviors. Unknown capability fields in a minimally completed application are not automatically filled with invented values.

The screenshot proves a saved application, not email delivery. The exact unfinished complaint remains for owner clarification.

## Verification

- 315 automated tests pass: 282 prior tests plus 33 new contact/branding/security tests.
- 16 browser workflow checks pass in a local synthetic preview, including Lenovo/Fortinet contact actions, quote CTA, sourcing-list transfer, form validation/submission, staff-only retrieval/review, visible deletion controls with cancellation, signup receipts, mobile navigation and logo loading.
- No JavaScript page errors or attempted external network requests were recorded in that isolated browser test. Local storage was in memory; no real records or emails were used.
- Six affected routes were checked at 390, 768, 1024 and 1440 pixels with no horizontal overflow.
- Five representative pages were scanned at desktop and mobile widths using the selected axe WCAG A/AA rules; no violations were reported. This is not a complete manual accessibility certification.
- Clean production-mode and preview builds are checked separately. Preview order-lab assets remain excluded from production output, and live commerce stays disabled.

## Remaining release gates

Verify the new Vercel preview build and owner-visible paths, obtain owner acceptance of the new logo and flow, resolve the incomplete signup complaint, and explicitly approve any production merge or email activation. A preview READY status is not proof of real hosted inquiry persistence or email delivery. Production commerce, supplier orders and payments remain out of scope.
