# Private Opportunities workflow

Open `/contractors/admin/opportunities` from the private contractor directory. The same existing administrator session is required. Every API operation authenticates on the server; no contractor-facing opportunity endpoint, pipeline, source feed, profile list or response portal is added.

## Staff workflow

1. Create an opportunity or paste structured JSON into **Import opportunity JSON**. Import only loads a review form; save it explicitly. It is not an automated solicitation/PDF parser or opportunity scraper. Read the complete solicitation, attachments, pricing schedules and addenda first.
2. Record trade, geography, staffing, capacity, schedule, experience, equipment and insurance/compliance requirements. Separate prime and subcontractor obligations. Record internal source, solicitation URL, procurement portal, agency, deadlines and time zone, costs, margins and bid strategy in private fields.
3. Complete full scope review, bid/no-bid rationale, compliance checklist, pricing/profitability, suppliers/subcontractors, useful competitor/incumbent analysis, risks/questions/deadlines and practical award strategy. Matching remains preliminary and never awards or contacts anyone automatically.
4. Write safe disclosure summaries and check exactly which fields may appear in outreach. No internal opportunity field, review note, source or internal title is copied into email. URLs are rejected in disclosure fields. Staff must still review free text for confidential information; the software cannot classify every sensitive phrase.
5. Compare each loaded contractor's current profile alongside the requirements. Load more pages before concluding there are no candidates. Manually select contractors, save selection, then choose **Draft Outreach** individually.
6. Review the recipient and entire draft. The email contains only selected disclosure fields and an allowlist of that contractor's current profile assertions. It asks about interest, availability, staffing, capacity, insurance/compliance, experience, equipment and travel. At approval, the server reads the current profile again and rejects a stale draft. Changing the opportunity invalidates unsent drafts.
7. Approve each email explicitly. Preview cannot send. Production delivery is disabled by default. A provider acceptance records `Sent`; this is not evidence of receipt, opening or contractor agreement. A persisted reservation and provider idempotency key prevent concurrent duplicate approvals.
8. Staff record replies, quotes and opportunity-specific confirmations from their approved mailbox. This release does not read mailboxes or auto-ingest replies. Use notes to capture quoted amounts, exclusions and evidence; use the requested status list to track progress.
9. Enter permanent company corrections separately as proposed profile changes. Review old versus proposed values and explicitly approve or reject. A company total of 20 and availability of 6 remain separate. Internal and verification fields cannot be proposed. An approved assertion is marked as needing re-verification; existing verification records are preserved. Concurrent profile changes block stale approval.

Statuses: Not Contacted, Draft Ready, Sent, Interested, Declined, Needs More Information, Quote Requested, Quote Received, Selected, Not Selected. `Sent` cannot be assigned through ordinary response entry. Response/status changes do not send emails.

## Storage and failure recovery

Private Vercel Blob uses the existing OIDC/BLOB_STORE_ID configuration. Opportunities are under `production/opportunities/` or `preview/opportunities/`; applications remain in their existing separate environment prefix. All writes are private. Updates use Blob ETag conditional writes plus opportunity revisions to detect concurrent edits. There is no public URL download or browser Blob token.

Each opportunity stores contacts, draft snapshots, opportunity confirmations, pending profile corrections and a staff action history. The current shared admin credential identifies actions as “Tri-Point administrator”; it cannot identify individual employees. Named staff authentication remains a future migration.

Profile approval reserves the decision in the opportunity before updating the company record. An interrupted approval appears as `applying`; refresh and select **Complete approved correction**. The profile's update audit prevents double application. Do not reject an approval that has already been reserved.

An interrupted email attempt becomes `sending` or `uncertain` and blocks further changes. Never assume a timeout means no email was sent. Check the provider's logs first, wait for any in-flight request to finish, then use **Record verified delivery outcome** with the provider receipt or evidence of non-delivery. Confirmed non-delivery clears the draft and requires fresh drafting and approval. No automatic resend is performed.

## Email configuration

Only after a sender is verified, configure production-only `RESEND_API_KEY`, `TP_OUTREACH_FROM` and optional `TP_OUTREACH_REPLY_TO` (defaults to `info@tripointgs.com`). `TP_OUTREACH_ENABLED=true` is additionally required. None of these settings were created or enabled during development. No real outreach is required or permitted for synthetic validation. Preview ignores the enable flag and never calls the transport.

The transport sends plain text through the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email) with the stored draft UUID as the [idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys). Blob concurrency follows [Vercel conditional writes](https://vercel.com/docs/vercel-blob/using-blob-sdk). The permanent send reservation remains authoritative after provider idempotency retention expires.

## Synthetic local preview

Run `npm ci`, `npm run build`, then `npm run preview` with Node 24. Open `http://localhost:3000/contractors/admin/opportunities`. Password: `synthetic-preview-admin-2026` — local preview only. The loopback server seeds two visibly synthetic contractors and redirects the Blob SDK to an in-memory adapter. It imports the actual API handlers, including existing signup and directory. No private Vercel data or external email service is accessed. Data disappears when the preview process stops. The preview script refuses to run inside Vercel.

The repository's public signup content, agency-facing homepage and normal directory are preserved. The Opportunities page is excluded from the sitemap and served with private/no-store and noindex headers. No data is embedded in the page shell.

## Release gate and rollback

Baseline commit: `087ea7e72953450ad1a87264b88fde0970f73b75`.
Last verified existing production: `dpl_DkuqCmLgBGeBfWCZUotsVoQB7CbM`.

Before production: complete a deployment to the existing Vercel project's Preview environment, confirm actual private Blob persistence and namespace separation using synthetic data only, check anonymous/intake/forged-cookie denial, check signup and directory regression, review disclosure canaries, profile-update conflict behavior and disabled preview delivery. Build production separately so preview noindex rules are not promoted accidentally. Do not deploy production if any required validation fails or remains unverified.

Rollback website behavior by redeploying the recorded production deployment. Preserve the Blob store and all application/opportunity records. Never reset the repository or delete records to roll back UI behavior.
