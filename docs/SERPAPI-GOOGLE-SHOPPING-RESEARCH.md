# SerpApi Google Shopping research — first read-only integration

Date: October 19–20, 2026. Review branch: `feature/td-product-controls`, stacked on existing draft PR #23. Production storefront and orders remain unchanged.

## User authorization and boundary

The owner signed up for SerpApi and reported adding `TP_SERPAPI_KEY` to Vercel and redeploying. Vercel variable metadata was inspected with decryption **disabled**; a branch-restricted Preview key is present. An additional Preview-wide key was also observed; remove that broader key only after confirming the branch-specific entry works. No key contents, credentials, customer data, supplier orders or external email were read, logged or changed in this work.

User intends an automatically collected multi-retailer average for selected TD items. We are implementing the first *candidate-retrieval* stage, not asserting that Google Shopping search snippets are verified retailer offers or that a two-source price average is ready for public use.

## Implementation

- Administrator-only POST `/api/product-controls` action `marketSearch` with a saved product ID. The server—not the browser—loads the saved product and forms a search query from its manufacturer plus exact manufacturer part number.
- One explicitly triggered SerpApi `google_shopping` US/English desktop search per click. Uses the existing branch's `TP_SERPAPI_KEY`, only on the server; fixed HTTPS endpoint, redirect rejection, one request, bounded JSON, 12-second timeout, and safe error messages. Never forwards supplier/retailer API keys in API output.
- The existing `limit` enforces up to three starts per 15-minute per-IP bucket. Provider quota/429 errors are displayed safely. The SerpApi request itself can consume credits, and the limit is not a monthly spend cap; leave scheduled refresh disabled.
- Response allowlist includes at most 40 candidates, title, retailer source label, extracted item price, sanitized Google product link, exact-part-in-title/snippet indicator, and reasons a result needs review. `product_link` must be an HTTPS Google Shopping product path; provider internal API URLs, tracking parameters, and raw JSON metadata are discarded.
- Obvious used/refurbished, installment/contract pricing, missing prices, Google multi-seller records, and products without the exact full manufacturer part are excluded from the **indicative title-match calculation**. Strict title-matched records can support a labeled *unverified* snapshot indicator when at least two distinct retailer source labels exist. This is not proof of seller independence, condition, exact configuration, stock, or current checkout price.
- No candidate is saved into the existing reviewed comparison book, counted in its verified average, or sent into Tri-Point selling-price rules. Research panel's manual review form remains intact for verified, separately inspected offers.
- No automatic weekly/daily schedule, order changes, payments, public listings, supplier dispatch, new third-party connections, or Production environment changes.

## Vendor documentation used

Official SerpApi documentation (checked October 2026):
- https://serpapi.com/google-shopping-api
- https://serpapi.com/shopping-results
- https://serpapi.com/api-status-and-error-codes
- https://serpapi.com/google-product-api (future product-offer detail stage; not called by this release)

Shopping results provide `title`, `source`, `price`, `extracted_price`, `product_link`, `product_id`, `multiple_sources`, `second_hand_condition`, `delivery` and installment metadata when available. These fields are not always complete and do not establish exact configuration or seller independence. Additional `google_product` requests may consume separate search credits, so none are automatic in this stage.

## Verification and next gates

- Existing 431 automated tests preserved, plus new collector/API safety tests; full test and build results recorded with the implementation.
- Local browser test uses clearly labeled synthetic Lenovo/Newegg/Walmart results, blocks all external requests and verifies the explicit button, candidate display, protected admin access, separate verified average, narrow-viewport layout and session expiry.
- Vercel preview build must be verified against the exact new commit. A successful build does not prove SerpApi credentials, product coverage, quota or hosted response format.
- Owner must press **Fetch candidates · 1 search** once on the saved Lenovo item. Capture status, result count and candidate list without exposing secrets. If no exact part match, do not fabricate an average; investigate search query or a controlled `google_product` follow-up based on actual response.
- Determine a permitted, budgeted, reliable automatic collector with product-offer detail, independent seller identity and validation before proposing scheduled refreshes. HP MAP checks remain separate from retail averages.

## Matching repair after first actual Google Shopping test

The user-provided live result list contained approximately 40 broad Lenovo products, many from other laptop families and several non-laptops, with zero visible exact manufacturer-part matches. For part 21KCS4S600, do not calculate a mean from those results. The search provider returned data but not sufficiently relevant products.

This revision offers two separate, manually triggered, one-credit searches: Shopping uses the quoted complete MPN plus manufacturer, and Exact-part web listings uses Google's organic search engine with the same quoted MPN. The web mode returns recognized HTTPS retailer product-page links based on title/snippet/URL exact-part signals but never converts prices in snippets into confirmed offers.

For Shopping records with a numeric product_id and no product_link, a safe Google-owned product-reference link is generated. Provider URLs, tracking data and credentials are not returned. Exact-part candidates display first. Unrelated or missing-MPN results are hidden until specifically requested. No candidate changes a reviewed comparison or customer selling price. Each mode consumes only one SerpApi request when clicked, with no automatic fallback or scheduled search.
