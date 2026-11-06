# Stripe merchant sandbox checkout return and verification diagnostics — October 23, 2026

## Reported user behavior
The first real fixed-$20 Stripe sandbox session returned to the Tri-Point admin login and then displayed “Not verified — latest check failed”. These observations do **not** establish whether the card payment was captured, refunded or declined. Do not initiate another payment merely to debug the return.

## Root cause established: cross-site return
The shared administrator cookie is deliberately `SameSite=Strict` (`lib/security.mjs`). Stripe's hosted checkout navigation originates on a different site and the first direct GET to `/admin/stripe-checkout` can lack the Strict cookie. The handler then sends the user to the login page. This is a cross-site navigation property, not evidence that their administrator credential was wrong.

New sessions return to `/admin/stripe-return?run=<validated-uuid>` instead. That preview-only page does not read a cart, accept payments, authenticate anyone, issue cookies or show private data. Its same-site client navigation forwards the validated reference to the existing admin-authenticated test page, preserving Strict cookie isolation. The route is noindex/no-store and remains protected at the deployment level. The prior session's return URL does not change retrospectively; users can open the stable `/admin/stripe-checkout` URL directly and use the same browser's saved reference after signing in.

## Verification failure remains to be diagnosed
The reported “latest check failed” text is the client-side fail-closed response when the server-side current-payment recheck failed. No matching detailed provider error was available in Vercel's queried runtime logs. Without the real processor response, an exact Stripe API cause cannot be claimed. The server now persists a safe failureStage label (account, session, session_match, link, intent) in the separate synthetic test record and logs only the stage, error class and numeric status. Neither the route nor the log exposes client secrets, IDs, checkout URLs, card details, buyer data, raw provider errors or webhook bypass values.

The current status still cannot become verified solely from a browser redirect; the independent Stripe Checkout/PaymentIntent/charge check remains mandatory, and TD ordering stays disabled.

## Recovery
1. Do not start a second test payment.
2. Open the stable protected branch URL `/admin/stripe-checkout` in the same browser/profile used for the first test; sign in if requested.
3. Select **Check payment with Stripe** and report only the resulting safe stage text, without secrets or full URLs.
4. Independently inspect the existing synthetic $20 payment status in Stripe sandbox Payments. An account charge is not a commercial Tri-Point order.
5. Investigate the reported stage before allowing a new test.

## Verification
Five additional tests cover anonymous no-data return hop, malformed/duplicate run rejection, Strict cookie preservation, safe failure stages and the new return-URL parameters. Existing checkout tests and site gates remain in force. No live charges, production merge, TD purchase order, Wasabi work or security relaxation was authorized.
