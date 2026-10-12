# Unified Login, gated contractor claim (October 2026)

The public `/login` page routes authorized Tri-Point staff through the unchanged current administrator login/cookie and provides a contractor company claim flow. The private `/contractors/account` shell makes only allowlisted own-company read/update API requests. Contractors never gain administrator, opportunity, source, match or other-contractor permissions.

SECURITY GATE: Contractor email-based login and all profile API operations remain disabled without production `TP_CONTRACTOR_LOGIN_ENABLED=true`, an independent verified `TP_AUTH_EMAIL_FROM` under tripointgs.com and a dedicated `RESEND_API_KEY`. Preview never sends mail. A separate Tri-Point email provider/account is recommended instead of reusing another business's Resend account. No production activation or DNS change is part of this release.

Authentication uses a 256-bit random one-use token bound to one unambiguous existing application email, expiry of 15 minutes, HMAC digest storage, atomic use marker, email and network rate limits, fragment-only claim URL, and an eight-hour HttpOnly Secure session cookie distinct from the admin cookie. An address matching multiple profiles requires manual resolution by Tri-Point.

The current company legal name and email are not self-editable; a signed-in contractor may change an allowlisted subset of self-reported capability details. Permanent assertions changed through the portal are marked for re-verification while existing internal flags/audits remain, with conditional ETag storage writes. No document-upload, procurement search, bid-education, paid-service or opportunity portal is added.

Before enabling production: verify sender ownership and DNS, test deliverability and same-origin auth in preview using a trusted isolated test sender, check single-use/replay and revocation, confirm a profile cannot see or edit another, establish expired token and rate-marker retention cleanup, and verify named admin identities for future expansion. The existing admin password is retained until an approved named-identity migration.
