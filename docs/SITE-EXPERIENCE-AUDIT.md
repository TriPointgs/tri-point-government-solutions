# Tri-Point site experience audit and redesign

Audit date: October 19, 2026. This is a review/preview change, not a production release.

## Baseline and scope

Baseline source: `720992aba6dab14d1f30bc1c6d72e38e90abd041`, the existing 15% pricing branch, based on production main `d3afa24ec383adbd4de5e705a2118b9ba18310f9`.

The read-only live-site pass visited 28 routes at desktop (1440 px) and mobile (390 px), inventoried 377 link occurrences, 17 button occurrences, and 10 form occurrences, and checked headings, fragment destinations, images, initial browser errors and horizontal overflow. Counts include repeated navigation and sign-in controls, not unique business features.

Five unauthenticated sensitive API probes returned 401. The protected catalog and Zoom administration redirected to sign-in. Eight external article/partner links returned 200. `/learn` and `/government-contracts/florida` returned the intended 410; the unreleased Zoom public pages returned their intended 404. These gates were not treated as broken links to be reopened.

No live forms were submitted, real records changed, email sent, payment made, or supplier order placed. Signed-in behavior was tested with synthetic local sessions and data. The audit does not certify every production-only feature or every external destination.

## Changes made

- One shared responsive header, search entry, navigation, mobile menu, partner menu, footer, and visual system across the homepage, public content, forms, partner pages and administrator views.
- Tri-Point navy, federal blue and muted gold; original logo and existing approved partner assets preserved. TD SYNNEX was a usability reference, not copied branding or a cloned authenticated portal.
- Homepage hierarchy and category-first discovery redesigned while retaining existing agency services, company identifiers, business address, contact paths, partner content and retired-resource boundaries.
- A sourcing category page with a tab-local itemized request list. It explicitly says online ordering is in development; it opens a draft in the user's email application and does not pretend to be a checkout or live inventory search.
- An order-automation lab and simulation-only server foundation, described separately in `COMMERCE-ORDER-FOUNDATION.md`.
- Catalog session expiry now clears old rows and disables pagination. Next/previous now use the last submitted query instead of unsent field edits.
- Enabled contractor sign-in now displays usable instructions rather than retaining a loading message.
- New-screen contrast issues found during the automated accessibility scan were corrected before final verification.

## Verification

- Existing baseline: 243 automated tests passed.
- New order/service/auth/site tests: 39, for 282 total tests.
- Local synthetic browser regression: 20 workflow groups, including navigation, sourcing-list actions, order lifecycle/exports, split shipments, uncertain supplier outcomes, high-value holds, administrator sign-in/out, directory filtering/CSV, catalog filters/paging/exact lookup/session expiry, contractor submission, opportunity editing, protected Zoom views, and order API persistence in memory.
- Final HTML pass: 24 preview pages, with shared header and primary heading checks, internal target validation, image/runtime/fragment checks, and desktop/mobile overflow checks.
- Production build: checked separately; demonstration order pages and executable browser lab assets must be absent. No production deployment was requested by these build checks.
- Automated accessibility checks cover eight representative screens against the selected axe WCAG A/AA rules. This is not a manual accessibility certification.

## Remaining release checks

Owner visual review of the preview; authenticated production-only feature checks; actual hosting/deployment verification; all real commerce adapter, payment, email, tax, shipping, storage, supplier-order and tracking gates. Do not merge or enable real transactions solely because the local simulation and build pass.

## Follow-up feedback correction

The later contact-button and logo changes are documented in `FEEDBACK-FIXES-2026-10-19.md`. The sourcing list no longer opens a mail application; it continues to the on-site request form. The original mailto behavior above describes the earlier baseline, not the updated preview.
