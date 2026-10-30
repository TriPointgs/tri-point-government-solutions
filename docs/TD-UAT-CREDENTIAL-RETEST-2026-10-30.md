# TD UAT corrected-credential retest — October 30, 2026

## Scope and verified source
The owner reported replacing all three UAT values with the intended matching credentials. Vercel metadata showed newly saved sensitive entries for TP_TD_UAT_CLIENT_ID, TP_TD_UAT_CLIENT_SECRET and TP_TD_UAT_CUSTOMER_NO, restricted to Preview and feature/td-product-controls. Values were not decrypted, displayed, copied into the sandbox, altered or committed.

Current application source: 543907a241ab1c52fea545346e2e1cafca208747, draft PR 23. The existing reviewed scripts/verify-td-uat.mjs was reused without modifying application or request code. A fresh Git-source Preview deployment was created at that exact commit so the current project variables were used instead of redeploying an older environment snapshot.

## Actual provider result
At 2026-10-30T06:48:17.141Z, the hosted probe made exactly one OAuth request and received HTTP 400 with the allowlisted error invalid_client. Zero price/availability requests were made. Neither credential had surrounding whitespace or enclosing quotation marks. This is an actual provider rejection, not a simulated result.

The outcome does not identify whether the submitted client identifier, secret, client registration, secret activation, application/environment mapping, or another provider-side configuration is responsible. It does not prove that the owner's entries are wrong, and it does not prove a provider defect. The earlier account-validation issue and product availability cannot be reassessed until authentication succeeds.

The supplier-provided OAuth guide, Accessing the TD Synnex Partner API.pdf, was extracted from the owner's supplied support message and page 4 was visually inspected. It specifies the same universal token URL used by the adapter, https://sso.us.tdsynnex.com/oauth2/v1/token, for Sandbox and Production. Its example uses a form-encoded POST with client_id, client_secret and grant_type=client_credentials, matching the adapter's request construction. No secret values from the portal were visually inspected, and matching request construction is not proof that the credential pair is valid. The original private support email/PDF were not committed to this public repository.

## Deployment and tests
Diagnostic deployment: dpl_2yBprp5GEbg3zNpbhRtsx3iEPvGG.
Unique Preview hostname: tri-point-government-solutions-7s79grn6l-tri-point.vercel.app.
Vercel independently returned READY, the exact source SHA above, Preview target and no alias error.
The hosted build ran 1,279 tests: 1,270 passed, zero failed and nine optional diagnostics intentionally skipped. The existing readiness audit and launch-preparation maintenance steps were skipped. Final experience validation passed for 75 HTML pages. No new application code, browser acceptance suite, independent-agent review or provider purchase test was performed in this retest. Passing application tests do not change the failed OAuth result.

## Shutdown and preserved boundaries
TP_TD_UAT_READ_PROBE_COMMIT was enabled only for the exact current Preview source SHA, then restored to off after the result and independently read back as off. No unchanged automatic retry is scheduled. The following documentation-only build must be checked for READY and a skipped read-probe log; it is not part of the provider test.

No price lookup, freight request, payment, supplier order, refund, customer email, catalog update, business-policy approval, tax-setting change or production release occurred. Main and production were not modified. The private merchant proposal and all transaction/approval gates were left unchanged.

## Next action and durable lesson
Do not ask the owner to re-enter the same pair again without new evidence. The appropriate next diagnostic is TD reviewing the active OAuth client registration and Sandbox secret/application mapping against the failure timestamp and documented request format. Any client identifier needed for support should use TD's approved secure process; never send a client secret or access token by email.

The product test remains SKU 7825493 / exact manufacturer part UNIVK-LAPTOP-LOCK. It remains unexecuted. No claim is made about its price, availability, currency, shipping eligibility or authorization based on this run. Public-launch readiness remains held for the previously documented technical, merchant and operational requirements.

No new support email was sent in this retest. A credential-free escalation can be prepared for the existing support thread, but delivery requires the appropriate communication authorization. Continue from this checkpoint rather than treating saved variables as successful authentication.
