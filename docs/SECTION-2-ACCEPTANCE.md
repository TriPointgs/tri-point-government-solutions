# Section 2 — Private fit evidence and intake policy

Base: Section 1 main ce2eccf8a9f82883967683e54b0261c16c608609. This section builds on the existing private opportunity workspace rather than replacing it.

## Changes
- County matching requires an explicit opportunity state and a known contractor state. Identical county names in different states cannot establish fit; no mileage is invented from ZIPs.
- Changes marked needsReverification cannot count as confirmed declared matches for trade, geography, insurance, licensing or capacity.
- Total company crew is labeled separately from project-available staff. Enough total staff still requires a project allocation confirmation.
- SAM registration does not automatically establish a subcontractor-specific obligation. Staff must review applicability in the actual solicitation.
- The existing comparison result shape, manual selection, draft/approval service, private record format, ETag concurrency safeguards and V5.0 Command Center sync contract are retained.
- New public applications explicitly carry the subcontractor-only consent version and role, and cannot enroll in general marketing or prime/training membership. Existing application and historic consent records are not rewritten.
- A successfully saved receipt is not turned into an apparent failure merely because obtaining the next challenge fails.

## Test scope
Fifteen focused fit-evidence tests pass in the local Node runtime before commit. Six new intake-policy tests and all existing regression tests execute in the Vercel preview build. The complete release must pass before merge. No production contractor information, secret value, live email or provider call is used by these tests.

## Remaining release sections
Section 3 will harden profile-aware outreach disclosure, stale-review handling and transport acceptance without sending real emails. Section 4 will exercise project confirmations and pending correction approvals in a full synthetic workflow. Section 5 is separate own-profile account/security and measurement work. Do not represent those sections as completed by this commit.
