# Verified launch preparation — October 29, 2026

## Actual completed work

The user requested continued work until the marketplace is ready for live use. This milestone resolves the missing TEST checkout webhook subscription, verifies the existing hosted endpoint's signature handling with a no-op event, and saves the first unapproved merchant-policy proposal through the existing private setup service. It does not make the marketplace ready for public transactions or approve missing business decisions.

The hosted maintenance report was observed at **2026-10-29T15:37:06.455Z**. It used the configured Stripe test credentials internally; no secret values, raw webhook URLs, private query parameters, account identifiers or customer information were emitted.

### Stripe TEST event coverage — repaired and read back

The existing matching, enabled test webhook endpoint was inspected, re-read immediately before the edit, and updated to add `checkout.session.completed`. A separate provider read confirmed the exact expanded event set. Existing subscriptions, URL, API version and the checked endpoint identity fields were preserved. The maintenance performed one additive endpoint update, not creation or replacement of the endpoint. No live-mode endpoint was edited.

Provider-side event updates do not provide a compare-and-swap mechanism here. The pre/post checks detect drift but are not a guarantee against every concurrent-operator race. Unexpected readback is held for review; the script does not silently overwrite or automatically retry an uncertain provider write.

### Hosted transport/signature check — passed, with a narrow meaning

The existing configured endpoint URL was used internally without changing deployment protection. An invalidly signed, deliberately unrecognized no-op event was rejected with the expected JSON/400 response. The same type of no-op event, signed with the configured application secret, returned JSON/200 with `received: true`, `ignored: true`, and `realSupplierDispatchAllowed: false`.

This verifies that the existing hosted route was reachable through its configured transport and rejected an invalid signature while accepting the configured signing secret for this probe. The synthetic event contained no payment or order identity. It did not request payment, order, supplier or refund mutation.

**This was not an actual Stripe-delivered checkout event and did not complete a product-linked payment test.** The report correctly leaves `actualStripeDeliveryVerified: false`. Real provider delivery and order reconciliation remain to be proven with the controlled end-to-end pilot.

### Private merchant proposal — saved and read back, not approved

The existing private checkout-setup service saved version `proposal-2026-10-29-v1` only after finding no earlier draft. It used expected revision zero, retained the service's conditional-write safeguards, and independently read back matching content. The saved result remained `approved: false` and `checkoutActivated: false`.

The draft proposes an initial standard-hardware assortment, transparent totals, shipping estimates and delay handling, cancellation, returns, warranty evidence, refunds and tax/exemption review. Its proposed contiguous-US geography and 30-day unopened-standard-hardware return policy still require owner approval and supplier/OEM feasibility. They are not adopted business policy or published checkout terms. Buyer access remains `undecided`; product classifications remain empty. No approved final-order merchant-policy record was written.

The generic proposal is retained in `ops/merchant-launch-proposal.json`. The saved merchant draft is private. The generated website output was checked and does not contain `dist/ops/merchant-launch-proposal.json`; it is not a publicly served customer policy. The public repository source does contain the generic proposal, with no private business records or secrets.

### Stripe Tax — exact missing prerequisite identified

The existing test Tax Settings response reported `status: pending`, `headOfficeRequired: true`, `headOfficePresent: false`, and no other pending missing fields in that response. The missing headquarters address was not inferred from the public website address or supplied with a synthetic substitute.

No Tax Settings, registration, product classification, tax-approval flag or zero-tax treatment was changed. A required address and active technical Tax Settings are not themselves proof of correct registrations, collection obligations or product tax treatment. The merchant-specific facts and review still remain.

## Source and deployment evidence

Repository: `TriPointgs/tri-point-government-solutions`.
Branch: `feature/td-product-controls`, draft PR #23.
Rollback source baseline: `6964b0dae5942ebaf58f053b3be10cc63dcee531`.
Implementation commit: `6fb95d9175be54f02f10001affffd90fbf041280`.
Exact tested tree: `1ee8d29d548a4b8180e683c9affe590f64b7940d`.

The feature ref was updated without force and with the expected previous SHA. The remote implementation commit was fetched into the sandbox; its tree independently matched the staged/tested local tree exactly.

Hosted maintenance deployment: `dpl_5Qr6qQ2tjuUcGhH94idGZQ59yKSC`.
Unique hostname: `tri-point-government-solutions-kbbr6fgct-tri-point.vercel.app`.
Stable Preview hostname: `tri-point-government-solutions-git-feature-td-edc7b1-tri-point.vercel.app`.
Vercel independently returned **READY**, the correct implementation commit, Preview target and no alias error.

Changing source back to the rollback baseline would not automatically undo the provider subscription or saved private draft. Any external-state reversal requires separate inspection and a scoped decision; no automatic destructive rollback is implied.

## Testing

Twenty new regression tests cover exact-commit/branch/host gates, actual raw webhook-handler signature processing with synthetic events, additive event updates, existing subscription/identity preservation, idempotent reruns, wildcard subscriptions, account/live-key rejection, ambiguous or incomplete lists, concurrent drift, uncertain replies, failed writes, protection HTML, invalid-signature acceptance, create-only draft persistence and readback, preservation of owner drafts, tax read-only behavior and output redaction.

| Verification | Total | Passed | Failed | Intentionally skipped |
| --- | ---: | ---: | ---: | ---: |
| Complete suite, sequential | 1,254 | 1,245 | 0 | 9 |
| Complete suite, randomized seed 20261025, four workers | 1,254 | 1,245 | 0 | 9 |
| Complete suite, randomized seed 7319, eight workers | 1,254 | 1,245 | 0 | 9 |
| Hosted maintenance build | 1,254 | 1,245 | 0 | 9 |

Clean Preview and production-mode builds also passed. The maintenance and read-only audit skipped without exact opt-in; production-mode validation did not release production. The nine optional hosted write/storage canaries remained disabled this turn and are not claimed as freshly executed. The twenty new targeted tests passed again after implementation publication.

The dependency audit reported zero known vulnerabilities at test time. This is not a security certification. There was no new buyer/admin screen or runtime transaction feature in this patch; no new browser acceptance run is claimed. Independent AI-agent review was not performed; test workers are not independent agents.

## Maintenance shutdown and preserved boundaries

`TP_LAUNCH_PREP_COMMIT` was temporarily set for only the exact feature Preview branch and exact implementation SHA. After inspecting the hosted report it was restored to `off` and separately read back as `off`. Existing read-only readiness audit and optional storage-canary activation were left off. The next documentation-only deployment must be independently checked for READY state and maintenance-skip logs before claiming final normal-preview completion.

No live charge, new test payment, supplier order, refund, customer notification, business-policy approval, tax registration, live-checkout activation or public release occurred. No new supplier-support email was sent in this milestone. At the initial thread read, the TD follow-up still contained only the previously sent request; a later reply must be checked before repeating that status.

Main was observed at `8c8dd7e200dd83e055de6276b73b04be795d646c` and was not changed, merged, rebased or deployed by this work. Authentication and deployment protection were preserved.

## Remaining launch requirements

Owner-dependent facts/decisions: confirm the actual tax headquarters and registration evidence through a secure source; approve or revise the proposed assortment/geography/return terms; choose the public guest/account access model; approve the final merchant policy and exact product classifications. Existing Stripe, captured-before-supplier and default-markup decisions are not reopened.

Provider-dependent: obtain TD's correct UAT account mapping, a valid test product/destination and non-billing/non-fulfillment assurance. Do not infer these from production read-only access or from the earlier unresolved sandbox error.

Technical/operational: run the actual product-linked hosted Stripe test with provider-delivered event reconciliation; run the separately approved TD UAT purchase/recovery test; finish general public purchasing/identity, transactional email delivery, refund/cancellation/delay operations, supplier cost/invoice controls, independent review and reconciliation with current main. Then use a separately authorized production-release checklist and rollback/monitoring plan.

The next step is no longer repairing this webhook subscription or creating another merchant draft: those are completed. Use the existing draft and this verified state, gather the missing decisions, and move into the controlled external pilot without manufacturing tax/merchant approvals.

Implementation notes: `docs/LAUNCH-PREPARATION-2026-10-29.md`. Proposal source: `ops/merchant-launch-proposal.json`. Focused context: `docs/MARKETPLACE-CONTEXT-INDEX.md`.
