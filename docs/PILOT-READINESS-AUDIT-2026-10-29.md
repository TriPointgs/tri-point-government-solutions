# Read-only pilot readiness audit — October 29, 2026

## Scope
This continuation addresses the remaining uncertainty in the deployment inventory: whether the configured Stripe test credential actually authenticates and whether the two known merchant setup records exist. It does not create another setup screen or approve merchant decisions.

Baseline/rollback: 4ea21577cf1ee1b3a7e31155cd2041cb8e348219 on feature/td-product-controls, draft PR 23. Main was independently observed at 8c8dd7e200dd83e055de6276b73b04be795d646c and was not changed, merged or released by this task.

## Exact-commit opt-in
`scripts/audit-pilot-readiness.mjs` runs only when VERCEL_ENV is preview, VERCEL_GIT_COMMIT_REF is the exact feature branch, and TP_PILOT_READINESS_AUDIT equals the exact 40-character VERCEL_GIT_COMMIT_SHA. `true`, another SHA, another branch and production all skip the audit before any external reads. The script is a build step, not an HTTP endpoint or authentication override. Existing administration and deployment protection are unchanged.

The diagnostic is placed before the existing final theme build step so that theme installation remains last. No source or generated storefront behavior is modified. Actual observation is a preview BUILD-environment snapshot, not proof of live runtime configuration or a completed checkout.

## Restricted reads and sanitized output
The storage adapter performs only private, no-cache, bounded reads of the exact configured merchant's setup draft and final-order merchant-policy paths. It never lists the store, reads customer orders, saves or deletes records, or enables finalization to obtain access. Missing records, malformed data, unverified reads and permission/transport failures have different output states. Policy flags are reported as stored flags, never as independent evidence of owner approval.

Stripe inspection accepts only a test-key pattern with test reads already enabled, first verifies the returned account against the configured account, then reads only the webhook-endpoint list and Tax Settings. There are at most three Stripe GET requests, no redirects, no automatic retries and no POST/PATCH/DELETE requests. Account mismatch stops later provider reads. Listing a webhook does not prove event delivery, signature-secret matching or reachability. Reading Tax Settings does not review registrations/nexus, approve tax collection or establish an exact product's classification.

Logs contain fixed status labels and booleans only, plus source SHA and timestamp. They do not include raw provider responses, credentials, account IDs, record paths, merchant text, product identifiers, addresses, customer contacts, webhook URLs or query secrets. Error text is never reflected. No `.env` file or credential is retrieved into conversation output or committed. Existing app gates are not modified.

## Testing and execution
The new regression tests cover exact-commit opt-in, production denial, fixed merchant paths, private read options, no writes, bounded/canceled streams, missing versus denied storage, invalid drafts/policies, authentication rejection, disabled reads, wrong merchant, webhook pagination/matching, rejected live responses and output redaction.

A test-fixture arrow-function syntax error was corrected before the targeted suite ran. The first full-suite run identified that theme installation must remain the final build step. The diagnostic was moved before that step; the existing theme-order test was not weakened. Repeated whole-suite and clean builds must pass before branch publication. There are no UI changes, so no new browser-feature claims are made. Separate test processes are not independent AI reviewers.

After the exact implementation commit is created, set only the new audit variable to that SHA for this exact Preview branch, publish the tested feature commit, inspect the hosted safe output and READY state, then restore the audit variable to off and read it back. Leave the existing hosted write-canary off. Any later documentation-only build should report the audit as skipped. No payment, supplier transaction, notification, policy, authentication or production flag is activated.

Actual hosted findings and verified deployment evidence belong in a subsequent checkpoint, not this implementation note. Supplier-support correspondence is kept in the authorized mailbox rather than publishing private email records here. The next external pilot remains subject to reviewed merchant inputs and provider-specific approval.

## Technical references reviewed
- Stripe account retrieval: https://docs.stripe.com/api/accounts/retrieve
- Stripe webhook-endpoint listing: https://docs.stripe.com/api/webhook_endpoints/list
- Stripe Tax Settings retrieval: https://docs.stripe.com/api/tax/settings/retrieve
