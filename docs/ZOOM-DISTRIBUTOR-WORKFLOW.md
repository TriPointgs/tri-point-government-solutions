# Zoom distributor pricing preparation — internal-only section

## Status and relationship boundaries
This section extends the existing private Zoom Sales Leads workspace without publishing the Zoom marketing page or introducing any distributor API connection.

Carahsoft is the Zoom distribution partner reported for Tri-Point. The distributor-pricing feature is intentionally a staff-prepared, copy-only email draft. Nothing sends to Carahsoft, Zoom, prospects or contractors from this feature.

The separate TD SYNNEX PartnerFirst UAI account was reported as awaiting a scheduled account synchronization. This workflow does not use PartnerFirst, assume an API entitlement, or store its credentials.

## Staff workflow
1. Open `/contractors/admin/zoom` using the existing Tri-Point administrator sign-in.
2. Open a Zoom lead and complete the saved internal product/seat estimate if known.
3. In the Carahsoft pricing request preparation section, explicitly select which optional end-customer fields may be shared: organization name, RFQ reference or current provider. They are all off by default.
4. Generate the private email draft. Review the entire subject and message and use Copy. The draft includes product/category, organization type, request type, approximate seats, and relevant dates; it does NOT include customer contact details, customer notes, internal prices/costs/margins, or private bid-document links.
5. Send through an authorized Tri-Point business mailbox to a real verified distributor representative, following applicable deal registration/customer-disclosure rules. No distributor address is invented, and no email is sent from the website.
6. Only AFTER sending, confirm the event on the site with the actual recipient and a meaningful message/thread reference. This is a staff attestation and is not independently verified by the website.
7. The record stores the reviewed email copy, disclosure choices, recipient, evidence and timestamp. For early-stage leads, status moves to `Awaiting Carahsoft`. Won/Lost leads must be reopened before recording a new request.
8. Log the distributor response as private notes, attach HTTPS quote/document references, and complete cost/term/margin analysis before proposing a customer quote. Sending an approved customer quotation remains a distinct manual action.

## Security controls
- Every related API call requires the existing server-enforced administrator session; mutations require the permitted website Origin.
- Distributor drafts are generated on the server from the **saved** lead, not unsaved browser edits. Request revision and SHA-256 fingerprint tie the user-reviewed text and disclosure selections to the exact lead version.
- The write is protected by the existing ETag conditional storage semantics and rejects stale draft/revision requests with HTTP 409.
- No automatic distributor email, API token, deal registration, pricing approval, purchasing or lead sharing is introduced.
- The manually confirmed evidence is auditable but should not be treated as proof of external email receipt.
- Preview uses only synthetic data. Public Zoom marketing stays gated until Tri-Point review and any required Zoom marketing approval.
- Existing contractor, government opportunity, administration, and PartnerFirst workflows remain unchanged.

## Validation / rollback
- Baseline production commit: `b1acfef22c3bd80178928dd33c7ed6b862948fef`.
- Targeted disclosure, approval, stale-review and access-control tests are in `tests/zoom-distributor.test.mjs`.
- The full Node 24 test/build gate must pass; examine preview and synthetic intake/admin interaction before merging.
- Roll back the GitHub release/deployment if necessary without deleting private Blob records. Existing distributor-request history is additive and is ignored by earlier code.

## Next independent sections
- Finish real inbox delivery acceptance for Zoom internal notifications.
- After Zoom marketing content approval, release approved copy and the public quote form through the existing two-part publication gate.
- Verify the PartnerFirst UAI account after provider synchronization; only then scope a separate, explicitly authorized TD SYNNEX API integration using actual provider API documentation.


## Synthetic browser acceptance
A real Chromium session completed a synthetic-only flow against the in-memory Node preview: existing staff login, unapproved review-only Zoom inquiry, private lead list and draft generation, default exclusion of customer details, explicit organization disclosure, invalidation after changes to disclosure choices, manual-send confirmation and audited record. No external email was sent and no real customer information was touched. Browser console reported zero JavaScript errors and the 390-pixel layout had no horizontal overflow. Run log is recorded in `docs/ZOOM-DISTRIBUTOR-ACCEPTANCE.json`.

The full project build/test was run with Node 24 (179/179 tests passed). The unapproved Zoom marketing page remains gated. Both contractor signup/authentication and the internal opportunity bot synchronization routes were unchanged.
