# Zoom Sales Leads — operating and release guide

## Access
Use the existing `/login` administrator credential, then `/contractors/admin/zoom`. The contractor login never grants this role. The private Zoom leads API, CSV export, individual records and all mutations require the existing server-validated administrator session. Scheduler credentials authorize only the reminder job, not lead access.

Current administration uses a shared staff credential. Assignment is a team-member responsibility label, not a new login entitlement. History accurately says authenticated administrator; this release does not pretend to provide named-user audit identity.

## Workflow
New -> Researching -> Qualified -> Awaiting Carahsoft -> Pricing Received -> Quote Submitted -> Follow-Up -> Won / Lost. Staff can set the appropriate state; changing state does not send a quote or email to the prospect. Save product/seat estimates separately from the immutable original inquiry. Record the distributor cost and proposed quote for the same period/basis. Gross margin is (quote minus cost) / quote, not net profit. HTTPS document references and internal notes remain private; the server does not download referenced documents.

The default renewal reminder is 30 calendar days before a supplied renewal date; it is editable. Follow-up dates are staff-controlled. Due indicators use America/New_York, ignore Won/Lost, and update on load/search. Test leads are hidden by default and excluded from the daily digest. Searches and exports traverse all backing pages up to a declared 2,000-lead safety limit; they fail rather than silently export an incomplete set. Migrate to an indexed datastore before substantial growth.

## Alert delivery
A successful submission is persisted before the internal alert attempt. Failure never converts a saved request into a failed submission. Notifications include a reference, product and sign-in link, not customer notes, RFQ details, contact information or pricing. Accepted provider IDs are recorded. Timeouts/ambiguous provider outcomes become uncertain; they cannot be blindly retried. Staff can reconcile with evidence after the in-flight guard, or retry a confirmed failed/disabled alert. A dedicated Send internal test email action sends one labeled synthetic message to info@tripointgs.com; it cannot select a customer recipient.

Review/test submissions NEVER send live alert mail. Preview never calls the real email provider. The API key remains server-side and is never in repository code, page markup or browser JavaScript.

## Environment variables
Existing `TP_SESSION_SECRET`, administrator authentication, `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID`, `SITE_ORIGIN`, and `RESEND_API_KEY` are reused without replacement.

- `TP_ZOOM_PUBLIC_ENABLED`: false or absent. Requires additional reviewed code approval; NOT enabled in this release.
- `TP_ZOOM_ALERTS_ENABLED`: true enables internal new-inquiry alerts only in production with a valid sender/key.
- `TP_ZOOM_ALERT_FROM`: optional override; defaults to existing `TP_SIGNUP_EMAIL_FROM`. Must be an address under send.tripointgs.com.
- `TP_ZOOM_NOTIFY_TO`: optional; this release permits only info@tripointgs.com.
- `TP_ZOOM_REMINDERS_ENABLED`: true enables the private due-date digest only in production.
- `CRON_SECRET`: at least 32 characters, production-only sensitive variable. Vercel scheduler calls `/api/zoom-sales?job=reminders` using its bearer token. Never put it in URLs or source.

A daily cron is configured at 13:00 UTC (9 a.m. Eastern daylight time; 8 a.m. Eastern standard time). It sends nothing when no eligible leads are due. One durable run record per Eastern calendar day prevents duplicate/uncertain retries. Uncertain digest delivery must be inspected rather than repeatedly triggered. Without flags/sender/secret the job fails closed. No prospect or distributor reminders are automatic.

## Storage and retention
All lead data uses a separate `production/zoom-leads/` prefix; previews use `preview/zoom-leads/`. Notification state resides with the lead and daily digest claims under `zoom-reminder-runs`. Reads bracket private Blob fetches with metadata ETags and updates use conditional writes; stale revisions return 409. Inquiries cannot update existing contacts, company profiles, opportunities or the bot catalog. Records have bounded notes/history; no automatic deletion of real leads is included. Handle access/deletion requests with verified staff procedures and review retention periods before scale. Rate-limit marker cleanup is an operational maintenance requirement shared with the original site.

## Public release hold
No static Zoom marketing HTML exists in `dist`; a server route checks approval before producing it. Anonymous/contractor requests return 404 while held. Admin page access redirects unauthenticated visitors to `/login`. Direct API marketing URLs and query parameters do not bypass this gate. The public sitemap/navigation remain unchanged. Unpublished page text exists in the public source repository for development; this is not a confidentiality boundary for the code itself, and earlier public history is not erased.

## Rollback
Pre-Zoom main: 37b9792324b187a373263e71d5b2bbac3322cf73. Roll back the Vercel production deployment if necessary without deleting Blob storage. Disable Zoom alert/reminder flags independently. Never roll back by restoring a public contract-source library or replacing contractor authentication.
