# Florida tax preparation checkpoint - November 2, 2026

This is an inactive preparation checkpoint on `feature/td-product-controls`, draft PR 23. Source rollback is `0359b5790923c764ce4c038ba2881246eae9ac7c`; production main was independently read as `574c00af9004cbf3023ef8cb7f59363af758df7c`. Never infer deployment completion from this file alone; verify the commit and READY preview through Vercel.

## Change
The owner-confirmed Florida registration is recorded separately from unverified Stripe settings and merchant approval. `FLORIDA-CHECKOUT-TAX-PREPARATION-2026-11-02.md` contains proposed purchase terms, classification review, government exemption manual-hold procedure, Stripe review checklist, lifecycle gaps, official sources and precise owner inputs. Context index and decision register are reconciled.

The existing tax adapter now includes quantity with each line total, requires `livemode: false` and explicit ordinary customer tax treatment, and validates tax breakdown reasons and totals. Unknown collection status, customer overrides and unsupported cases are held. No local Florida rate/cap is invented. Product-exempt zero tax is distinct from customer exemption. Existing flags and private configuration are untouched.

## Verification
- Targeted tax/finalization suite: 43 passed, including six new regression tests.
- Isolated Linux / Node v24.22.1 full-suite runner: three complete runs (serial and two randomized orders), each 1,392 tests, 1,382 passed, zero failures, ten intentional opt-in hosted skips.
- Independent AI code review found a missing-field exemption ambiguity; fixed to require explicit `none`, with missing/null/empty tests. Re-review found no additional code defect.
- Local Windows Node v26.3.0 also passed the final targeted tests and repeated full-suite checks. Initial byte-hash failures were caused by checkout CRLF conversion of unchanged SVG assets; canonical repository bytes restored. No logo changes are part of this commit. Local Windows build reached an existing path-separator issue in public-boundary generation; it is not represented as a passing build.
- Linux clean preview-mode and production-mode builds both passed serially. Checkout and checkout-setup Chromium suites passed at desktop 1440px, mobile 390px and tablet 768px (six scenarios), with zero browser errors or uncontrolled external requests. Mock payments only. No hosted storage/provider diagnostic was enabled. No actual Stripe calculation or product-linked hosted payment was performed.

## Boundaries and remaining evidence
No policy was approved, private merchant record written, tax registration created, payment collected, supplier purchase submitted, automatic email sent or public release made. Registration evidence/number/effective date, Stripe settings/registration, first exact product tax codes, policies and exemption process still require the inputs listed in the preparation packet. A standalone sandbox payment or an external delivery-check email is not the product-linked checkout pilot.

Tax Transaction creation and reversal reconciliation are still required before production; the current standalone calculation plus explicit tax line in Checkout is not a complete filing ledger. Actual county/cap/shipping/exemption behavior still needs a separately authorized provider test. Public launch remains blocked.
