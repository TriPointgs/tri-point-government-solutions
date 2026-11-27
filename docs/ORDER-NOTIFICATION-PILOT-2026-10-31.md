# Exact-order notification pilot — October 31, 2026

## Scope
Continue feature/td-product-controls / draft PR 23 from 12871cd8be79904176465bbe73b9b7dbc17c752d. Main was observed at 574c00af9004cbf3023ef8cb7f59363af758df7c and is not modified. This patch adds a bounded private notification pilot, not general public shopping or automatic customer communications.

The administrator workspace is /admin/order-notifications. It reuses /api/shop, requires server-side administrator authentication, and is linked from the supplier pilot and launch center. The recipient confirmation page is /buyer-preview/verify-email. There is no new serverless function, scheduler, cron, inbound email processor, webhook or runtime dependency. Existing unsent notification drafts remain unsent and separate.

## Implemented workflow
One exact finalized TEST order can receive at most one mailbox-verification email and one reviewed status notice. These would be actual outbound emails when independently approved and configured, not provider sandbox transactions. No actual email was sent during implementation or synthetic testing.

The sender, recipient, sender-domain ID, test order and preview origin are server-configured; browser input cannot choose or replace them. The preview origin must match this deployment or its branch alias. Before sending, the adapter verifies the exact Resend domain is verified and sending-enabled with open/click tracking disabled. A dedicated key is used instead of repurposing existing form-mail credentials.

The verification message is generic: it contains no product, total, address, private payment information or order-access capability. A random 256-bit token is scoped to the exact order and email configuration, stored only as a hash, expires in fifteen minutes, and is consumed by an explicit consent POST. The browser immediately removes the fragment from its URL and does not place the token in browser storage. GET/HEAD, link scanners, open events and delivered events cannot establish confirmation. Possession of the emailed token is limited mailbox proof, not an authenticated customer identity or an order/account login. Confirmed proof is valid for at most twenty-four hours for this one test notice.

The actual notice must match the exact reviewed saved-order snapshot. Source changes invalidate the review. The service rechecks the original verification email before the notice, rejects newly observed adverse delivery results and checks proof/revocation again before the outbound call. Notices clearly state TEST and distinguish saved payment/refund/fulfillment observations from a real purchase, shipment, receipt or bank-credit confirmation.

## Duplicate prevention and uncertain outcomes
A conditional private record is written and read back before the single outbound POST. A provider idempotency key is supplemental protection, not permission to retry after its retention window. Once an attempt is recorded, a new request identifier, reload, process restart, response timeout or twenty-four-hour delay cannot authorize another send. There is intentionally no reset, resend or replacement-recipient operation in this pilot.

A lost send reply is recovered by reading the exact provider email ID and validating the original sender, sole recipient, subject, text, HTML hash, unique message reference, creation window, lack of CC/BCC/reply-to or scheduling, and recognized delivery state. If the provider ID was lost, an administrator may supply that ID for matching; arbitrary content is never returned, and the operation never sends. A challenge received with a lost POST reply can still be confirmed, but its provider reference must be recovered before a notice is sent.

Delivery checks persist a unique check claim before the provider GET. A late check cannot overwrite a newer observation. Bounces, complaints and suppression permanently block subsequent sends. Provider errors leave the state uncertain; raw provider responses and credentials are not exposed. Revocation preserves existing observations and prevents future sends/confirmation, but cannot recall an email or stop a provider request already in flight. Successful provider delivery is not proof of human reading.

## Configuration and activation boundary
The independent Preview settings are TP_ORDER_MAIL_FROM, TP_ORDER_MAIL_TO, TP_ORDER_MAIL_DOMAIN_ID, TP_ORDER_MAIL_ORDER_ID, TP_ORDER_MAIL_ORIGIN, TP_ORDER_MAIL_API_KEY, TP_ORDER_MAIL_PREVIEW_ENABLED and TP_ORDER_MAIL_PILOT_APPROVED. The key must be saved directly in protected platform configuration, never chat or source control. Its effective permissions must support the required exact domain/email reads and email send; sending-only keys may not suffice for recovery. Select the minimum provider-supported scope that supports this pilot. No key was created, decrypted, copied or changed here.

The branch environment inventory was read without decryption and contained none of these new settings. No setting was written or activated. Existing optional storage/readiness/maintenance/authentication diagnostics remained off. The connected Resend domain read showed the Tri-Point sending subdomain verified with sending enabled and tracking disabled. That read does not choose a sender address, authorize any recipient, verify the deployment's key or prove inbox receipt.

The owner must choose the exact From address and intended test mailbox and approve the finalized test order before real sending. The recipient must be able to access the existing protected preview; this implementation does not weaken Vercel deployment protection. Actual sender/recipient delivery, provider content normalization and hosted private persistence for this new area still need the controlled real pilot. No delivery-success claim should be inferred from mock responses or a successful build.

## Verification
Forty-three new ordinary regression tests passed. The complete suite passed in three orders: sequential, seed 20261025 with four workers, and seed 7319 with eight workers. Each contained 1,386 tests, 1,376 passing, zero failures and ten intentionally skipped optional hosted diagnostics.

Nine real local-browser suites passed across twenty-seven desktop/mobile/keyboard-tablet scenario combinations: checkout, checkout setup, order operations, fulfillment pilot, invited buyer payment, launch center, order exceptions, buyer exceptions and order notifications. The new notification suite was rerun after the final origin-binding change. It verifies separate administrator/recipient sessions, no confirmation on GET, explicit proof, exact notice, damaged response clearing, mobile lost-reply recovery, provider status reads, revocation, anonymous denial, absence of browser credential storage and responsive layout. Each notification scenario sends exactly two synthetic emails and zero actual emails. No browser script errors or uncontrolled external requests were observed in these scenarios. HTML was checked locally in Chromium; this is not an Outlook/Gmail inbox rendering certification.

Clean Preview and production-mode builds passed with 1,376 passing tests and ten intentional skips, validating seventy-five and seventy-four HTML pages respectively. Production-mode validation is not a production deployment. The production dependency audit reported zero known vulnerabilities at test time; this is not a security certification.

No hosted storage canary was enabled or run for this feature. Independent AI-agent review remains outstanding; discovery did not yield an invoked reviewer, and test workers/browser contexts are not independent agents. The later verified checkpoint must supply actual commit/tree/deployment evidence; this implementation note alone is not deployment proof.

## Remaining work
Execute the separately approved real email pilot after sender, recipient, exact order and secure configuration are selected. Then extend the proven transport to approved multi-event notification operations and delivery-event automation without weakening duplicate prevention or identity checks. Permanent buyer identity/public checkout and automatic notification enrollment are not completed by this pilot.

The earlier TD UAT OAuth/product-read success is preserved. No unchanged authentication retry, actual payment/refund, supplier purchase, customer email, policy/tax approval, main merge or production publication occurred. The actual product-linked Stripe/TD/refund pilot and its missing approved supplier/merchant inputs, post-submission cancellation, shipping delays/returns, supplier-cost reconciliation and independent release review remain separate outstanding work.

## Technical sources
Official Resend documentation checked: Retrieve Email, Retrieve Domain, Idempotency Keys, and the documented last_event enum. Idempotency retention and provider delivery status do not substitute for the application's durable one-shot claim or recipient's explicit confirmation.
