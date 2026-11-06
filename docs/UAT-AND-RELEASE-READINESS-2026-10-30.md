# UAT connection and release-readiness integration — October 30, 2026

## Scope
Continue on feature/td-product-controls / draft PR 23. The user supplied separate UAT credentials through branch-specific sensitive Vercel variables. No secret values were retrieved into chat or the sandbox. A narrowly scoped hosted build probe uses the existing read-only TD adapter with an in-memory mapping of the UAT credential names; it does not change the existing production-reader configuration.

Starting source: dc04c9b2f58c1fa726b7e2a179763f2efa870e19. Read-probe implementation: 6215e061c989f26392bee574424828140def4bef, tested tree 1d95c4b94b544bd8eb43d19ca33ea6cee6ac70f6. The first hosted probe at 2026-10-30T05:14:00.466Z returned oauth_rejected after one OAuth request and zero product requests. This is a real integration failure, despite the application's build/tests passing. It does not establish whether the client ID, secret, application mapping or provider configuration is responsible. No product availability, account validation, payment or supplier purchase was proven by that result.

## Safe UAT probe
`scripts/verify-td-uat.mjs` runs only for Preview, the exact feature branch, and TP_TD_UAT_READ_PROBE_COMMIT equal to the exact deployed SHA. All other builds skip before any request. The wrapper permits only the documented common OAuth token endpoint and one US UAT GetPriceAvailability request for the supplier-provided SKU 7825493 / manufacturer part UNIVK-LAPTOP-LOCK, using the existing REGULAR/EA version 2.8 request.

No price lookup occurs after OAuth rejection. No retry, supplier order endpoint, freight request, payment, catalog mutation or storage write is allowed by this probe. Credentials and bearer tokens stay internal. The result reports only fixed statuses and selected booleans; raw descriptions, errors, account identifiers and exact supplier prices are not emitted. Currency is not inferred from geography, and UAT price/stock is not production-price evidence.

The follow-on diagnostic changes what is inspected: failed OAuth responses are bounded and reduced to HTTP status and an allowlisted OAuth error code, plus booleans for surrounding whitespace and quoted credential values. It never outputs error descriptions, credential lengths, hashes or raw values, and it does not silently trim or replace credentials. This is a bounded diagnostic of the first failure, not repeated unchanged requests hoping for success. Record its actual hosted result in a verified checkpoint; do not infer it from synthetic tests. Disable and read back the opt-in switch after the attempt.

## Main reconciliation without production release
The previously divergent main commit 574c00af9004cbf3023ef8cb7f59363af758df7c was fetched and compared with the shared ancestor d3afa24ec383adbd4de5e705a2118b9ba18310f9. Git's merge-tree reported no conflicts. The exact merge adds only 50 already-published ContentMX article JSON files to the feature branch; no existing application code or unrelated content is replaced. The resulting content/blog tree is exactly the existing main tree 5ecb855f9b71fc7e7dad057524e2c08830411f1b. The feature commit should retain main as a second parent after the integrated test tree is published.

This brings the pinned current main content into the private marketplace preview; it does not merge the marketplace into main, publish the checkout, change the public domain, or retarget/merge the draft PR. Any subsequent main changes still need review before a future release.

## Accurate launch workspace
The existing /admin/launch report now distinguishes the implemented product-linked TEST checkout, separate invited buyer payment access, gated UAT single-attempt dispatch, buyer-safe status and persistent unsent message queue from configured-but-unverified services. It no longer says supplier dispatch is entirely unimplemented/read-only or that product checkout has not been integrated.

The report exposes only safe configuration booleans. It does not call providers, read/adopt merchant policies or infer approval from credentials. Exact supplier-order and spending gates remain enforced by the existing operation services. Public checkout and release are always held in this report. Separate outstanding cards identify general public purchasing/identity and refund/cancellation/delay operations. Owner decisions include the still-undecided guest/account model.

Links now lead to the existing product-checkout, buyer invitation and supplier pilot workspaces. Navigation wraps on smaller screens. Refresh requests are bounded, duplicate refresh clicks are guarded, and failed/invalid responses clear previously rendered status instead of leaving old evidence visible. Unexpected public-ready responses are rejected rather than displayed as approval. No activation control or new HTTP route is added.

## Verification method
Run the complete suite sequentially and with both randomized concurrency settings. Build clean Preview and production-mode outputs with all maintenance opt-ins off. Run the new launch-center browser suite on desktop, mobile touch and keyboard/tablet, then all five existing checkout/setup/order-operations/fulfillment/buyer-payment browser suites. Synthetic failures in the new browser check are intentional; successful reload must recover without retaining stale cards.

The first clean-build tool call was terminated by its short execution timeout while another suite was running. It was rerun sequentially with a sufficient execution limit, not by weakening tests. An initial browser test expected 18 cards; inspection confirmed the intended 17 cards (14 prior + 3 new), and only that erroneous test expectation was corrected. Independent AI-agent review has not occurred; parallel workers and browser processes are not agents.

Actual test totals, hosted diagnostics, deployment READY evidence and switch shutdown belong in the final verified checkpoint. A successful build with a failed OAuth check is not a successful supplier integration.

## Remaining boundaries
No actual product-linked Stripe pilot, TD purchase, tax configuration, customer email, refund or public release is authorized by these diagnostics. Merchant proposals remain unapproved. Correct provider authentication, approved exact test order/destination/currency/limit, tax and policy review, public purchasing/identity, email delivery, exception workflows and independent release review remain necessary. The supplier's non-billable UAT confirmation is not permission to invent the missing order-specific inputs.
