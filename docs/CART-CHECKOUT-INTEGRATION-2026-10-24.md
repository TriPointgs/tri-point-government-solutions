# Private cart checkout integration — October 24, 2026 (Eastern)

## Verified milestone and source
The user supplied a screenshot confirming the prior $20 sandbox capture AND saved sandbox record. That is user-provided hosted evidence completing the storage-recovery milestone, not evidence of commercial fulfillment.

Baseline/rollback: 11393e454abfe340a723f2ba7581aca985e45e7a.
Repository: TriPointgs/tri-point-government-solutions.
Branch: feature/td-product-controls; PR 23 remains draft/unmerged.
Main independently checked before and after implementation: c1af230f4b4bc647a649c837f19d96a901a998d3.

Deployed implementation: c26e9c25881797b43cce8e7545e78f9504fdb527.
Exact implementation tree: 936234b55493b3e6d594a93ccb1eab26848ff4f8, independently matched to the local tested tree after the final retry-parameter correction.
Vercel deployment: dpl_QuvwzZZBKicDzvRgj1QzfJVetSCF; READY, Preview (target null), aliasError null.
Unique host: tri-point-government-solutions-1r2v2wq6e-tri-point.vercel.app.
Stable host: tri-point-government-solutions-git-feature-td-edc7b1-tri-point.vercel.app.
Checkout path: /shop-preview/checkout; normally enter through the saved review's Continue to private test checkout link.

## Scope preserved
Private merchant preview only. No main merge, production deployment, new hosted Stripe Session/payment, live payment, TD purchase order, refund, customer email, tax-policy approval, or credential change occurred. Original logo/brand and unrelated Wasabi work are untouched. The repository is public; fixture addresses and terms are explicitly synthetic. No persistent personal-memory update is claimed.

The integration is implemented and tested, but actual product-linked hosted payment creation is NOT activated. TP_CART_CHECKOUT_PREVIEW_ENABLED was not created or enabled. Approval and configuration guards must be satisfied before activation; a successful build is not authorization to bypass them.

## Implemented workflow
Saved cart review -> server-finalized immutable test order -> explicit Stripe TEST Checkout -> authenticated payment/charge verification -> durable order/payment binding and saved status.

The finalizer reuses supplier availability, pricing/margin/MAP, freight, tax and policy checks. Exact approved purchase-terms text is displayed and bound by its SHA-256 digest; accepting a version without reviewed text cannot activate checkout. No unknown tax is converted to zero or government exemption assumed.

All private order reads and writes require administrator authentication and the original signed cart owner. Same-origin checks, rate limits, field validation and production rejection remain enforced. Missing cart cookies are not silently replaced to regain access. Forged browser totals or paid flags are rejected.

Opening Checkout requires separate test-payment consent and a fresh check that cart, product/pricing revisions, stock/quote, shipping and merchant policies still match the finalized order. A saved open Session is resumed, not replaced. Uncertain creation retries use the same order, Stripe idempotency key AND identical parameters; expiry is derived from the saved first-attempt time, not the retry clock.

Integrated Stripe requests use the pinned SDK's hosted_page interface, allowed_payment_method_types card filter, explicit automatic capture and a 31-minute Session expiry. A data-free public return hop enables the following same-site navigation without weakening Strict authentication cookies. Browser return does not itself mark paid or create a payment.

Signed provider events can reconcile a paid Session before the browser returns. Exact account, test mode, Session, payment, amount, order, version and quote digest must match. Unknown payments do not manufacture orders. The prior fixed-$20 sandbox and already-bound payment event handling remain supported. Turning off creation does not discard valid signed payments from already-opened Sessions.

A fresh, non-serializable server linkage proof permits recording a late captured payment against its ORIGINAL quote timestamps. The order remains held when the supplier quote expires; the system does not silently reprice, change the quote deadline, authorize TD dispatch or automatically refund. The UI distinguishes verified capture from an expired-quote review hold. Saved status reads do not contact Stripe; a failed recheck clears the visible approval. No payment/contact data is stored in browser storage.

## Local verification
- Existing 957 regular tests remained passing.
- 30 added integration/route tests cover exact totals, signed-event-first completion, quote-expiry holds, ownership, CSRF, exact terms digest, changed cart/stock/policy, replay, concurrent starts, uncertain creation, delayed retry payload stability, altered Session identity, refunds/adverse events, stale proof, forged linkage, safe return hop and production denial.
- Total: 990 tests; 987 passed, zero failed, three explicitly gated hosted-storage tests skipped locally.
- Clean preview and production-mode builds passed with 25 and 24 final HTML pages. A production-mode build is NOT a production deployment.
- Real Chromium/Playwright against the actual HTTP handler with injected Stripe/TD/tax fixtures passed nine workflows: review-linked terms consent, immutable totals, explicit Checkout, return hop, manual reconciliation, saved-status reread, expired-quote hold, failed-verification clearing, and disabled configuration.
- Browser widths 390/768/1440 had no horizontal overflow. No browser script errors or uncontrolled external network requests. Stripe navigation was intercepted locally: one mock Session, zero Stripe network requests, zero real payments or TD orders.
- The browser harness initially failed because mocked Stripe HTML lacked UTF-8 for an em dash. Correcting the fixture charset fixed its selector; no application workaround was introduced.

## Hosted verification: passed
The c26e9c2 Vercel build reports 990 passed, zero failed, zero skipped, final 25-page validation passed and Deployment completed. READY was independently read.

TP_CART_CHECKOUT_STORAGE_TEST used the actual final-order, Checkout Session and payment-ledger services with REAL Blob storage and SYNTHETIC Stripe, TD and tax providers. The unique disposable preview/cart-checkout-canary namespace avoided all existing records. Its log reports:

- realBlob: true; syntheticStripe: true; syntheticTD: true
- finalOrderSaved: true
- paymentSaved: true (including independent saved-status reread)
- webhookBeforeReturn: true
- lateHoldSaved: true
- retrySafe: true
- cleanup: true

The two earlier explicitly enabled Blob diagnostics also passed. This is not a real product-linked hosted Stripe payment pilot and does not claim to place an actual TD order.

After verification, the existing non-secret branch-scoped TP_BLOB_STORAGE_CANARY setting was restored to off and independently read back. All three hosted-storage tests are disabled by default. A later documentation-only build should therefore report 987 passed and three intentional skips, with the implementation unchanged. No recurring diagnostic task was created.

## Hosted smoke checks
The stable preview served /assets/cart-checkout.js with HTTP 200 and the expected new implementation. A request to the protected cart-checkout-config route returned HTTP 401; authenticated configuration contents were not inspected through that request. Deployment protection bypass does not bypass application administrator authentication.

The public /shop-preview/checkout-return hop with a synthetic UUID returned HTTP 200, data-free explanatory HTML, private/no-store and no-referrer headers, no Set-Cookie, and no payment/order details. It did not create or inspect an order.

## Remaining activation requirements and next action
Do not make another fixed-$20 payment. The new page can show readiness blockers until reviewed inputs and explicit activation exist. Those disabled controls are deliberate business-approval guards, not the earlier lost-reference bug.

Before a separately authorized product-linked hosted sandbox pilot, supply and review the actual purchase/returns/cancellation/warranty terms, customer shipping policy, tax registrations/settings and exact product tax classifications, plus the required test flags. Contractor-network terms and a Florida resale certificate do not substitute for those requirements. No such approval was fabricated by this implementation.

After activation and a real hosted test pilot, remaining launch work includes abandoned-session handling, reviewed refunds/cancellations, durable customer accounts/order history, TD PO acceptance/idempotency/uncertain-response recovery, actual fulfillment/tracking/email, and reconciliation with newer main. Live payments, TD ordering and production publication require separate approval and verification.

Primary API references checked: https://docs.stripe.com/api/checkout/sessions/create and https://docs.stripe.com/checkout/fulfillment; pinned stripe 23.0.0. Stripe's minimum hosted Session expiry exceeds the existing 15-minute supplier quote, so late capture is explicitly recorded and held rather than silently repriced.
