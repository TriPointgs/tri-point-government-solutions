# Zoom customer quotation — private staff review

Use the existing Zoom Sales Leads private lead detail. First save the exact license configuration, quantity, verified distributor cost, proposed customer price and pricing basis.

Enter explicit license term, price validity, tax treatment, provisioning/delivery conditions, exclusions and an internal distributor quote reference. The server prepares a quotation draft using those saved values. It never invents a price, product term, discount or contract vehicle. Distributor cost and margin are private; only the proposed customer price and relevant terms appear in customer-facing copy.

An administrator must expressly review the complete draft and approve it internally. Proposed below-cost prices additionally require acknowledgment of the estimated loss. Approval stores an immutable copy and does not contact a customer, distribute a quote or place an order.

Manual sending is a separate confirmation recorded only AFTER an employee sends the approved text using an authorized business mailbox. The recipient in this release must match the original business email on the saved inquiry. Staff supply thread evidence; this is a manually attested event, not independently verified provider delivery.

Approvals are invalidated for delivery if the associated product, buyer identity, quantity, price, distributor cost, pricing basis or terms change. Changes require generating and approving a new draft. Closed Won/Lost leads cannot draft a new customer quote until reopened.

This workflow reuses the existing admin session, CSRF origin check, private Blob ETags and lead revision concurrency. It does not enable emails to prospects, buyer order creation, supplier procurement, Zoom public marketing, or TD SYNNEX PartnerFirst UAI integration. The independent Lenovo authorization page/badge remains separate.

Rollback baseline: 37b286f88ec5a5e570bd8fa6f705e1e98f785f4b. Customer quotation history is optional on existing lead records and initialized for new ones. No database migration or record deletion is required.
