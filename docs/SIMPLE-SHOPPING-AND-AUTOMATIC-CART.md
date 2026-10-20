# Simple shopping and automatic TD cart — preview implementation

Date: October 20, 2026. Parent commit: 25d5c5011fcf808e36b2cd6f0034eb280a736549. Existing review branch: feature/td-product-controls, draft PR 23. No production release.

## User correction and implemented workflow

The owner rejected the manual Smart Pricing worksheet as the ordering interface. The customer flow must be product discovery, quantity and Add to cart, with supplier data and business arithmetic handled by the server. This revision implements that flow, rather than asking customers for acquisition costs, packaged weights, warehouse selection, fees, profit floors or review attestations.

- New /shop-preview page and Preview-only /marketplace redesign: product search, one category control, product cards, quantity, Add to cart, and one ordinary cart.
- Add to cart resolves any new product identity from the existing private TD catalog on the server. It does not require a separate administrator draft-import step.
- Adding, changing quantity, removing an item, changing delivery ZIP, or reopening a saved nonempty cart automatically refreshes price and availability with TD GetPriceAvailability. No separate Check selected with TD button is part of the shopping flow.
- The cart applies the existing 15% default/category/manufacturer/product overrides automatically. Business-cost defaults and qualified competitor inputs remain merchant configuration, not per-order shopper inputs. The existing smart engine can be invoked when a confirmed operating-cost profile is available. Its missing fee/authorization configuration is not silently fabricated or turned into a customer worksheet.
- A normal US delivery ZIP triggers TD GetFreightQuote, letting TD select warehouses for the requested SKU/quantity combination. Freight is re-quoted as quantities or destination change.
- Customers see selling-price estimates and availability, not supplier cost, markup strategy, warehouse records, weight metadata, source-review notes or credentials.
- The old per-row Smart price control and prominent worksheet button are removed from the normal product workflow. The diagnostic remains under a collapsed Advanced staff tools section in merchant settings. Staff research and catalog controls remain separate.

## TD specification used

The implementation is grounded in the owner's supplied TD US OpenAPI and Price & Availability documents, not a different regional or StreamOne API.

1. PriceAvailability version 2.8 includes weight when supplied and positive. The old adapter discarded this field; the new adapter retains it. The supplied schema does NOT identify a measurement unit or prove packaged shipping weight, so the system does not invent pounds or use it alone to waive delivery charges.
2. POST /api/v1/webservice/json/GetFreightQuote, Version 2.1, accepts Items with exact SKU and Quantity, ShipToZipCode, and automatic warehouse selection when ShipFromWarehouse is omitted.
3. A response may contain Shipment[] with per-shipment Items, AvailableShipMethods and returned rates; quote validation must cover every requested quantity exactly, even across warehouses.
4. OtherCharge (minimum-order/COD fees) is parsed at documented response/shipment levels. Ambiguous duplicated levels, unknown fees, missing extra-charge confirmation and unexpected method-level charges are not silently assumed free.
5. The schema describes FreeFreightThreshold as currently always zero. It is ignored as qualification evidence; zero delivery is used only from an actual complete returned quote.

The adapter uses the existing authenticated server OAuth connection. No purchase-order, allocation, shipping-label, payment, invoice or email operation has been added. It uses fixed endpoints, no redirects, bounded JSON, safe error messages, matched account/ZIP/product/quantity checks, and the existing production-read authorization gates.

## Currency blocker resolved from account evidence

Private TD PartnerFirst US order correspondence for this reseller explicitly states that displayed prices are in USD. The corresponding nonsecret account-currency setting was added and read back as USD for Preview / feature/td-product-controls only. No credential values were read or changed and no Production setting was modified. The private order email and its personal/account details are not copied into this public repository.

New price observations obtained after the deployment use the confirmed account currency. Older persisted observations are not rewritten retroactively. This is account-source evidence, not an inference based only on a dollar symbol or a US endpoint.

## Shipping and missing data

The owner reports free TD shipping for orders over $1,000 and under 100 pounds. The shopper never needs to compute that rule or enter weights. This first automatic cart uses the actual TD freight estimate and account response rather than assuming the account benefit from incomplete metadata. A nonzero supplier quote is not overwritten with a guessed zero, and a failed/incomplete quote shows delivery confirmation pending.

A delivery ZIP is normal shopper information; full shipping address, tax and payment belong to the later checkout integration. The current cart displays an estimate before tax, not a final charged total. No free-customer-shipping promise is published independently of the returned delivery estimate and later reviewed selling policy.

If TD returns no valid USD price, stock is insufficient, identity does not match, delivery remains unconfirmed, or an applicable manufacturer pricing restriction is unreviewed, the cart flags the issue in normal shopping language. The customer is not asked to fix supplier configuration. Missing prices remain null, not zero. A failed refresh preserves product selections but invalidates old totals; an expired quote is hidden until automatic refresh succeeds.

## Access and persistence

This remains a staff-authenticated customer-experience preview. It does not constitute public listing approval or a live customer account system. Anonymous visitors and contractor sessions cannot read cart data or merchant diagnostics, and the new API rejects all Production calls.

Carts use a separate private preview/shopping-carts namespace, bounded records, revision/ETag checks and a signed Secure/HttpOnly/SameSite cookie. Browser requests supply SKU, quantity, destination ZIP and expected revision only. They cannot supply distributor costs, approvals, competitor prices, freight amounts, weights or a different cart's identity. Conflicting tab writes fail without silently overwriting the newer cart. Customer responses contain a narrow safe projection, never the raw stored cart/observations.

The preview's /marketplace shell changes only during a preview build. The current public production marketplace is untouched. Existing product research, contractor records, inquiries and order-simulation code are preserved.

## Verification and limitations

- All prior 547 tests pass. Forty-eight new supplier/freight/cart/authentication/persistence tests bring the suite to 595 tests.
- Seventeen local browser workflows pass using clearly synthetic supplier data and memory-only carts: login return path, no worksheet inputs, no manual import, Add/quantity/destination automatic reads, changing freight estimates, saved cart reload, out-of-stock handling, removals, customer data isolation, responsive widths 390/768/1024/1440, retired prominent calculator controls, preview marketplace routing, clear cart and session expiry.
- No external supplier calls, real payments, new orders or hosted cart writes were made during those isolated tests.
- A bounded independent review was performed; its method-level fee claim was checked against the actual schema. Unsupported method-level charges are now conservatively flagged rather than asserted as documented input. No broad accessibility certification is claimed.
- Generated screenshots are local synthetic renders. Container-backed image viewing was unavailable; successful automated layout tests are not represented as manual visual inspection.
- Preview and production-mode builds are checked before commit; exact deployment readiness is verified separately.

The new live TD freight response has not yet been exercised through the user's authenticated hosted cart. First hosted Add-to-cart/read/write and freight response verification remain pending. Existing live price-and-availability success is separate evidence. Payment, tax calculation, customer authentication, live supplier purchasing, automated retailer-offer qualification and confirmed operating-cost profiles remain launch work. Checkout remains explicitly disabled; no customer order can be submitted by this release.

## Next action

Use the shopping preview, not Product Control Center, to search a product and add it to the cart. The normal quantity and delivery ZIP are the only order-estimation inputs. Validate the actual TD-backed cart read and freight estimate, then complete behind-the-scenes checkout infrastructure without reintroducing pricing worksheets into the customer journey.
