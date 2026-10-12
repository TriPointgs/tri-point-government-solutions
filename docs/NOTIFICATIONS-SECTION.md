# Signup notifications, phase A (October 2026)

All saved applications appear in the existing private admin directory. The administrator can see a new-application count, mark individual applications reviewed, and keep the existing protected sign-in. No contractor information is made public.

A transactional email adapter is implemented but fails closed until the following production-only environment variables exist:

- RESEND_API_KEY: a dedicated sender API key for Tri-Point (not another company's API key)
- TP_SIGNUP_EMAIL_FROM: a verified address under tripointgs.com
- TP_SIGNUP_EMAIL_ENABLED: true

The sole permitted recipient is info@tripointgs.com. Preview never sends. Email delivery failure never reverses an already saved signup, and the private directory retains it as new for review. No emails were sent during tests. Changing the recipient requires security review; do not send notifications to subcontractors.

The current authenticated directory offers manual mark-reviewed controls; changes use Vercel Blob conditional writes. If another staff member modifies the same profile concurrently, the action fails rather than overwriting changes.

The next section is a shared sign-in page and contractor profile claiming. It requires verified identity email delivery and own-profile-only authorization before contractor login can be activated. The current administrator password remains supported until an explicitly tested replacement is deployed.
