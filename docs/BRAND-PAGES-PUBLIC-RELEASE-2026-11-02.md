# Wasabi and PTZOptics public release - November 2, 2026

Owner explicitly requested publication of the reviewed product pages to the live website. This release starts from production main dfbb726c6feca8ed16b8dd8921b2b7b92067b140, not the private marketplace branch. Its source tree and deployment are the rollback point.

## Included
- Two full brand product pages, native local imagery, 19 Wasabi offerings/capabilities, and 47 PTZOptics family/reference cards covering 95 variants/models/plans.
- Product details, search/categories, comparison and legacy toggle, FAQs, guidance, cross-links and shared navigation/footer discovery.
- The current public contact page's manual email workflow is preserved. Selected product text is displayed safely and included in a user-opened email draft. No new inquiry database, API route, automatic email or contact submission behavior is introduced.
- Existing homepage, marketplace Coming Soon page, published blog and production access boundaries are preserved. No changes to payment/tax/supplier configuration or private checkout code. Draft PR 23 remains separate and unmerged.
- Pages retain noindex while the owner checks the live design. Source evidence and explicit catalog limits are in the two asset-coverage documents. Original manufacturer marketing archives remain untouched.

## Verification
The production-source full suite passed: 241 tests, no failures or skips. Clean production build passed its existing homepage, Coming Soon, content publishing, SEO/link and boundary checks. The prior feature-source suite had 1,388 passing tests plus ten intentional hosted skips; that is separate evidence, not the test count for this smaller public-source release.

Release browser checks cover both pages at 1440, 768 and 390px, including all image decoding, selected/unselected tab contrast, category/search/reset, legacy visibility, comparisons and three-item limit, Escape close, no overflow, safe email inquiry prefill, no form submission, zero script errors and zero external requests. Final hosted status must be independently verified after publication.

Rollback production deployment before this release: dpl_3NNtZv78VizMuWRqgEvccvc6b96T. Do not promote the private checkout feature preview to publish these pages.
