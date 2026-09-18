# Tri-Point Contractor Network — Launch Operations

## Release scope
Static SEO pages generated at build time, private server-side intake, an authenticated internal directory, preliminary matching, CSV exports, referral/source attribution, explicit optional marketing consent, and privacy/participation notices. Existing agency-facing homepage and branding are preserved.

This release is not a live solicitation aggregation system. No Opportunity Bot integration, bid import, automatic outreach, email verification, scheduled newsletter, paid ad campaign, public contractor directory or third-party tracking pixel has been enabled. Never claim otherwise in marketing. Qualification and certification are self-reported, not verified. Public resources are not current bid listings.

## Administrator access
Open https://tripointgs.com/contractors/admin. In the existing Vercel project `tri-point-government-solutions`, an authorized owner can reveal the encrypted `TP_ADMIN_PASSWORD` environment variable. Do not paste it into a chat, a repository, an issue or a link. Use a password manager. The cookie is HttpOnly, Secure, SameSite=Strict, and lasts eight hours. Rotating `TP_SESSION_SECRET` and redeploying invalidates existing sessions. Password changes require redeployment. This is a single-administrator launch credential, not multi-user role-based access; replace it with named SSO accounts before expanding internal access.

The directory loads 25 applications per page. Search and filters only cover loaded records. Use Load More until no additional pages remain before drawing conclusions or exporting the complete set. CSV exports contain personal/business contact information; keep them in private storage. Delete requires explicit confirmation. Do not delete a real profile as a test.

## Private storage and security
Applications are private Vercel Blob objects under production/applications or preview/applications. Preview data must never be treated as production data. Server-side Blob access uses project OIDC plus BLOB_STORE_ID. No token is shipped to the browser. No public insert/read endpoint bypasses validation or administrator authentication. The GET intake endpoint returns only a signed short-lived form challenge. POST is same-origin, size-limited, validated and abuse-limited.

Initial form collects no W-9, Social Security number, tax ID, banking information, credential, full address or file upload. Do not add them casually. A vendor website is stored as text, not fetched by the server. HTML rendering is escaped; CSV formula-leading characters are escaped. Logs do not intentionally print application bodies or credentials.

The launch abuse control uses private atomic create-only markers, with three submissions or five login attempts per network address per 15-minute period. Hashed rate markers remain until operational cleanup; before sustained traffic, implement authenticated deletion of expired rate markers and review quota usage. Distributed attacks require stronger protection (for example a configured challenge service and edge limits). Failures show errors, not fake success.

Blob is a deliberately small-network storage layer, not a relational CRM. Plan a database migration with access policies, audited named users, verification statuses and a tested backup/retention policy before substantial growth. Do not place contractor data in the public GitHub repository. Monitor current Vercel quotas and plan terms. No paid-plan upgrade or paid ad spend was authorized by this release.

## Intake workflow
1. Check new submissions and contact only in the scope of their permission.
2. Confirm the business, service area, actual capacity and appropriate licenses/insurance.
3. Keep formal certification separate from a statement about ownership.
4. Request evidence through an approved private channel only when necessary.
5. Record verification separately; never label a profile verified merely because a checkbox says yes.
6. Review the complete solicitation, pricing files and addenda; make a bid/no-bid recommendation, compliance checklist, cost/profit analysis, supplier/incumbent research, risk/questions/deadlines and award strategy.
7. Treat geography/trade/capacity matching as a shortlist, not an eligibility decision. Prime requirements do not automatically apply to every subcontractor. Define relationship and pricing in writing.

## Consent and email
No automated email sender or newsletter was configured in this release. The application stores affirmative operational consent and a separately unchecked future-marketing preference. An opt-in is not a verified email address. Before newsletters: use a verified sender/domain, an email confirmation flow where appropriate, suppressions, unsubscribe handling, valid physical mailing address and email compliance review. Do not import every applicant into marketing; filter alertsOptIn and honor withdrawals. No recurring email schedule is promised publicly.

## SEO and editorial controls
Public HTML renders without JavaScript. Unique titles/descriptions, canonicals, Open Graph, Organization/Article/BreadcrumbList markup and internal linking are present. Sitemap includes only indexable public content; utility/admin/confirmation/policy pages are excluded. Preview pages and preview robots block indexing. No JobPosting markup is used for procurement.

Google Search Console must be connected with access to the correct property. Submit https://tripointgs.com/sitemap.xml only after production deployment. Sitemap acceptance is not indexing, and indexing is not a ranking guarantee. No traffic or ranking improvement has been measured at launch.

Add opportunity pages only for actual reviewed notices with official source URL, solicitation number, agency, accurate deadline/time zone, current status, last verification timestamp, addenda controls and meaningful original analysis. Do not publish generated city/trade combinations merely to rank. Remove open status when the deadline passes and use archived content only when genuinely useful.

## Deployment and rollback
Baseline main commit: 54cd22ce55908db1f32ecaf3b7993487bb726326.
Prior production deployment: dpl_2dMEeyN4srVdfnBuDgBrfQZx2mo5.
Build runs Node unit tests and static-page metadata/internal-link checks. A preview must pass actual form persistence, authenticated reads, unauthenticated denial and test-record deletion before production.

The Vercel project originally had no Git link. Do not assume commits automatically deploy. Use a pinned Git commit or verified native deployment action. Changing source-only pages requires a new build. Preview and production must build in their respective environments so noindex is not accidentally promoted.

To roll back website behavior, redeploy the recorded old production deployment through Vercel; do not delete the Blob store. This preserves applications. Any rollback can remove intake availability, so confirm the public message and contact path.
