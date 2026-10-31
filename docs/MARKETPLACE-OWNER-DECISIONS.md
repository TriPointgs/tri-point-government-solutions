# One-time business decisions before opening checkout

Status: owner-decision register, reconciled October 25, 2026. Unapproved entries are preparation items, not adopted terms or legal/tax advice. This is for Tri-Point operations, not a shopper worksheet.

Use `/admin/checkout-setup` in the private preview to prepare a saved draft and export a review packet. Saving there does not approve policy, activate payments, or change the public website. Verified implementation evidence is in `docs/CHECKOUT-VERIFIED-2026-10-25.md`; the earlier fixed-$20 payment success does not establish product-linked pilot completion.

| Decision | Why it is needed | Current position |
|---|---|---|
| Payment provider and Tri-Point-owned account | Hosted card handling, settlements, dispute management and test credentials | Stripe is selected and the merchant-owned TEST integration exists. The earlier fixed-$20 captured-payment/storage test passed. Product-linked hosted checkout still requires its separate configuration and pilot. |
| Capture timing and supplier acceptance | Avoid capturing funds for a supplier order that cannot be fulfilled | Owner-selected captured-before-supplier flow: authorization alone cannot release TD purchasing. Full amount/currency/order-linked capture is checked server-side; TD dispatch remains disabled. |
| Tax registrations / nexus settings / product tax categories | A tax engine requires reviewed business inputs and matching transaction data | Not configured. Do not assume zero tax or automatic government exemption. |
| Exemption review | Buyer exemption documents must be validated and stored appropriately | No collection or automatic exemption bypass is enabled. |
| Returns, cancellation and restocking | Supplier conditions can vary by hardware, licenses, configuration and manufacturer | No fabricated universal return window, free returns or restocking amount. Owner approval required. |
| Warranty and damaged/DOA claims | Tell customers whether support comes from Tri-Point, manufacturer or distributor and how to report issues | Needs approved scope and support contact/service hours. |
| Shipping destinations / exclusions / partial shipments | Freight, address restrictions and split shipments affect actual costs and promises | Existing TD quote supplies estimates. Owner-reported threshold is supplier benefit, not an automatic customer promise. |
| Merchant fee / handling / reserve profile and minimum profit | Existing 15% markup alone may not cover every order's cost | 15% default approved. Proposed smart-pricing floors are not automatically approved operating assumptions. |
| Published brands, products and images | Partnership does not prove every product/customer type/media asset is authorized | Start with documented eligible assortment; preserve manufacturer MAP/embargo rules. |
| Customer service, privacy and record retention | Live orders need purchase-specific policies, secure access and retention/deletion processes | Existing public terms/privacy are contractor-network focused. Private review records can be discarded but no public retention policy is asserted. |

Proposed choices can now be saved as revisioned private drafts in Checkout setup; they remain separate from approved merchant configuration. Exact policy and tax review evidence still needs explicit owner approval before any activation. Customers should still see a normal product/cart/address/payment flow, not these setup questions.
