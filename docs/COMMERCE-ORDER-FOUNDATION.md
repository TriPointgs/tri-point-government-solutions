# Order management foundation — simulation release

## What this change implements

The new order domain separates website receipt, payment authorization, manual sourcing approval, supplier submission intent, supplier acceptance, captured payment, package shipment, package delivery, and notification preparation. It preserves an immutable selling-price snapshot and applies versioned state transitions.

The browser lab at `/preview/orders` is compiled only for non-production builds. It contains fixed fictional products and an `example.invalid` buyer. It can demonstrate the entire lifecycle, partial shipments, a high-value hold, supplier rejection, and an uncertain supplier response. It never calls a payment provider, TD SYNNEX, or an email transport. Its export is a customer-safe simulation record, not a real invoice.

## Server foundation

- `/api/commerce` requires the existing administrator session for every read and write.
- `/admin/orders` is the authenticated HTML view. Its UI currently runs the same browser-only demonstration; it is not connected to durable server records yet.
- All production requests are rejected, including valid administrator requests. There is no production activation flag in this release.
- Preview persistence is separately off by default. The repository adapter requires a non-production environment, `TP_ORDER_LAB_ENABLED=true`, and configured private Blob access.
- Preview records use only `preview/commerce-order-lab/` and fixed `SIM-` identifiers. Real customer payloads are rejected.
- A saved revision contains the order, processed event IDs, and notification outbox together. Compare-and-swap prevents two competing updates from succeeding at the same revision.
- A retry with the same event ID returns the already-processed result. Reusing the ID for a different action is rejected.
- The local preview server uses an in-memory repository. No hosted storage has been enabled or tested by this change.

The private Blob adapter is a preview implementation, not a production transaction database. A production ledger, provider-event store, durable worker queue, access model, retention policy, and recovery/reconciliation design remain a separate release milestone.

## Non-negotiable side-effect boundaries

No module here sends a supplier purchase order, captures money, sends email, fabricates carrier delivery evidence, or performs a refund. Outbox messages have `dispatchAllowed=false` and `status=preview_only`.

The simulated supplier submission gets one stable PO reference. If its result is uncertain, the order moves to `reconciliation_required`. A second submission cannot start. A confirmed existing-PO acceptance can resolve the uncertainty; other outcomes remain for staff review rather than triggering blind retries.

Payment authorization is not described as a paid receipt. Supplier acceptance is not described as shipment. Delivery is package-specific, and delivering one package does not complete a split order. Shipped quantities cannot exceed ordered quantities. An unpaid/unsubmitted simulation draft can be cancelled; refunds and real supplier cancellations are not implemented.

Customer projections omit acquisition cost, product gross profit, supplier references, internal review notes, and event fingerprints. The customer notification previews contain only selling prices and appropriate order/shipment details.

## Relationship to prior work

This change is based on the separate 15% pricing-rule branch. The markup engine remains server-side and is not connected to unverified historical catalog fields. The current working Windows catalog gateway is untouched. The gateway repair and pricing pull requests are not implicitly merged.

## Next implementation gates

1. Validate authenticated TD SYNNEX **production** price, availability, freight and relevant product/customer eligibility. UAT success alone is not production verification.
2. Finalize buyer account permissions, public product-data publication rights, retail pricing protections, taxes, shipping policy, cancellation/return policy, and payment authorization/capture timing.
3. Build the durable production order/event/outbox repository and authenticated customer order history. Choose/configure hosting only with approval.
4. Implement read-only production adapters first. Test all business errors and line-level partial responses, not just HTTP 200.
5. Implement payment/supplier dispatch workers with provider verification, retry reconciliation, least-privilege secrets, limits and an emergency stop. No blind resubmission after timeouts.
6. Connect transactional email and verified shipment/carrier status, including duplicate/delayed events and split shipments.
7. Complete sandbox fixtures and an explicitly approved controlled real-order pilot before enabling public checkout or automatic supplier purchases.

## Test execution

`npm test` covers the pure order domain, versioned service, server auth/production gates, and existing workflows. `npm run build` also checks the final shared-site output and verifies simulation assets are excluded from production builds.

Browser evidence was collected separately with Playwright in an isolated local preview. It is not evidence that live production payment, mail, contractor self-service, supplier fulfillment, or carrier integrations were exercised.
