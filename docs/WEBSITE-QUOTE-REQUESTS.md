# Website quote requests

The public marketplace builds an itemized request for review. It does not create an order, reserve stock, quote prices, collect payment, approve an exemption, or submit a supplier PO.

Customers can select published Wasabi and PTZOptics product families, add custom descriptions or part numbers, edit quantities, select multiple brands and areas of interest, and submit one form. The picker excludes catalog entries marked legacy. Product eligibility, exact configuration, pricing, and availability require review. A request holds at most 15 items, with quantities from 1 to 9,999.

## Routes and storage

- `/marketplace`: product selection and sourcing categories.
- `/contact`: contact details, item list, project information, consent, and receipt reference.
- `/admin/inquiries`: existing staff authentication, request details, manual reply link, and mark-reviewed action.
- `/api/contact`: rewritten to the existing intake function with the quote channel, preserving the 12-function deployment boundary. The subcontractor intake remains a separate channel.

Only descriptions and quantities are retained in this browser tab. Contact details and free text are not persisted in browser storage. The private Blob store separates `production/contact-inquiries/` from `preview/contact-inquiries/`. Staff list, detail, and review routes enforce existing server-side administrator authentication. Public receipts never return inquiry details.

Submissions use a purpose-specific, expiring, environment-bound signed challenge, origin validation, a honeypot, minimum dwell time, rate limits, size limits, and strict field validation. A request is independently read back before acknowledgement. Repeating an identical reference and normalized payload returns the same request; changing an existing reference is rejected. The browser preserves an immutable retry payload after an uncertain response.

## Internal alerts

Production intake requires `TP_CONTACT_INTAKE_ENABLED=true`. Internal alerts separately require `TP_CONTACT_EMAIL_ENABLED=true`, the existing server-side `RESEND_API_KEY`, and a valid `@send.tripointgs.com` sender in `TP_CONTACT_EMAIL_FROM` or the existing `TP_SIGNUP_EMAIL_FROM`.

The sole automatic recipient is `info@tripointgs.com`. Alerts contain a reference, fixed category/brand values, and the private staff link. They omit customer contact details and procurement free text. Customer confirmations and order emails are not enabled by this feature. Preview submissions never send email, even if email flags are present.

A conditional write claims the alert before sending. The provider receives a deterministic request-specific idempotency key. Staff see `accepted`, `failed`, `uncertain`, `sending`, or `disabled` notification state. Provider acceptance alone does not prove inbox delivery. Failed or uncertain alerts do not discard saved requests and are not blindly resent. Staff should check the workspace regularly and investigate unresolved notification states through provider logs before any manual resend.

## Staff handling

1. Sign in with the existing staff account and open Website quote requests.
2. Review items, quantities, project scope, timing, and delivery location; ask for missing information using the manual reply link.
3. Confirm exact configuration, sourcing eligibility, price, freight, tax treatment, and terms before issuing a quotation.
4. Treat a tax-exemption checkbox as a review request only. Do not request tax documents through the general form; use the approved secure review process.
5. Mark reviewed after initial review. This action sends no email and does not mean a quotation was issued or accepted.

Requests with sensitive information, privacy requests, retention, and deletion require staff handling under the published privacy policy. There is no automatic deletion or customer email workflow in this release.

## Release validation

The build includes backend validation, origin/authentication boundaries, duplicate/concurrent submission behavior, persistence readback, email failure handling, and no-customer-email tests. Browser checks cover 1,440px, 390px, and 320px layouts; multiple products/brands/interests; quantities/custom items; product-page prefills; staff review; and an interrupted response followed by an identical retry.

Production smoke verification uses one clearly identified synthetic website-verification request, private persistence readback, and actual inbox receipt of its internal alert. Retain its reference in the private release checkpoint, not this public document. Preserve the previous production commit for rollback. Keep payment, supplier-order, production-tax, and customer-email release decisions separate.
