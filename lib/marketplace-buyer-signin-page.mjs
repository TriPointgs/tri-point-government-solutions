const escapeAttribute = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function marketplaceBuyerSignInPage({ issuer, publishableKey, preview = true, deliveryEnabled = false, cartTestScenario = null,
  sandboxCheckoutVisible = false }) {
  const fapi = escapeAttribute(issuer);
  const key = escapeAttribute(publishableKey);
  const scenario = preview ? cartTestScenario : null;
  const destination = scenario ?
    escapeAttribute(scenario.address.city + ', ' + scenario.address.state + ' ' + scenario.address.postalCode + ', United States') :
    'Leesburg, FL 34748, United States';
  const productPicker = scenario ? `<p>
        <label for="buyer-cart-add-product">Test product SKU</label><br>
        <select id="buyer-cart-add-product">
          ${scenario.products.map(({ sku, manufacturerPart, quantity }) =>
            `<option value="${escapeAttribute(sku)}" data-part-number="${escapeAttribute(manufacturerPart)}" data-quantity="${escapeAttribute(quantity)}" title="${escapeAttribute(manufacturerPart)}">${escapeAttribute(sku)} · Quantity ${escapeAttribute(quantity)}</option>`).join('')}
        </select>
      </p>` : '';
  const deliveryForm = preview && !scenario && deliveryEnabled ? `<section id="buyer-delivery-estimate" aria-labelledby="buyer-delivery-title" hidden>
      <h2 id="buyer-delivery-title">Check Florida shipping</h2>
      <p>This is a separate test estimate. We share the ZIP code and item with the distributor for the estimate. The test checkout uses the fixed Leesburg address.</p>
      <form id="buyer-delivery-form">
        <fieldset>
          <legend>Florida delivery address</legend>
          <label>Street address <input name="line1" maxlength="180" required></label>
          <label>Apt or suite <input name="line2" maxlength="100"></label>
          <label>City <input name="city" maxlength="100" required></label>
          <label>ZIP code <input name="postalCode" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" required></label>
          <button type="submit">Get shipping estimate</button>
        </fieldset>
      </form>
      <p id="buyer-delivery-status" role="status" aria-live="polite"></p>
    </section>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>Marketplace customer sign-in | Tri-Point</title>
  <link rel="stylesheet" href="/assets/launch-center.css">
  ${preview ? '<link rel="stylesheet" href="/assets/marketplace-buyer-checkout.css">' : ''}
  <script defer crossorigin="anonymous" src="${fapi}/npm/@clerk/ui@1/dist/ui.browser.js"></script>
  <script defer crossorigin="anonymous" data-clerk-publishable-key="${key}" src="${fapi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js"></script>
  <script type="module" src="/assets/marketplace-buyer-signin.js"></script>
</head>
<body>
  <header>
    <a href="/" aria-label="Tri-Point home"><img src="/assets/tripoint-logo.svg" width="220" height="45" alt="Tri-Point Government Solutions"></a>
    <nav aria-label="Marketplace"><a href="/marketplace">Marketplace</a></nav>
  </header>
  <main data-marketplace-mode="${preview ? 'preview' : 'account'}">
    ${preview ? '<p class="eyebrow">PROTECTED MARKETPLACE TEST</p>' : ''}
    <h1>Customer sign-in</h1>
    <p>${scenario ? 'Sign in with a verified test account to review the approved products and access your private test orders.' :
      preview ? 'Sign in with a verified test account to review a Lenovo desktop and access your private test orders when checkout is available.' :
        'Sign in or create a marketplace account with your email.'}</p>
    <p id="buyer-signin-status" role="status" aria-live="polite">Loading sign-in…</p>
    <div id="buyer-signin-form" hidden></div>
    <div id="buyer-signin-actions" hidden>
      <button type="button" id="buyer-signin-check">Check sign-in</button>
      <button type="button" id="buyer-signin-out">Sign out</button>
    </div>
    ${preview ? `<section id="buyer-cart" aria-labelledby="buyer-cart-title" hidden>
      <h2 id="buyer-cart-title">Your test cart</h2>
      <p>${scenario ? 'Add each approved product to prepare the test checkout.' : 'Lenovo ThinkCentre neo 50q Gen 5 Tiny · 13B90032US.'}</p>
      <p>This private preview uses a fixed test destination and test payment details. It makes no live charges, supplier purchases or shipments.</p>
      <p id="buyer-cart-summary"></p>
      ${scenario ? '<ul id="buyer-cart-items" aria-label="Items in your test cart" hidden></ul>' : ''}
      ${productPicker}
      <button type="button" id="buyer-cart-add">${scenario ? 'Add test product' : 'Add Lenovo desktop'}</button>
      ${scenario ? '' : '<button type="button" id="buyer-cart-remove" hidden>Remove desktop</button>'}
      <button type="button" id="buyer-cart-reload">Reload cart</button>
      <p id="buyer-cart-status" role="status" aria-live="polite"></p>
      <form id="buyer-review-save" hidden>
        <p><label><input type="checkbox" name="consent" required> Save a private review using the test contact and delivery details.</label></p>
        <button type="submit">Save checkout review</button>
      </form>
      <form id="buyer-review-open">
        <p><label for="buyer-review-id">Saved review ID</label><br><input id="buyer-review-id" maxlength="36" required autocomplete="off" spellcheck="false"></p>
        <button type="submit">Open review</button>
      </form>
      <div id="buyer-review-result" hidden>
        <h3 id="buyer-review-title"></h3>
        <p id="buyer-review-summary"></p>
        <button type="button" id="buyer-review-discard">Discard review</button>
      </div>
    </section>
    ${deliveryForm}
    <section id="buyer-checkout" aria-labelledby="buyer-checkout-title" hidden>
      <h2 id="buyer-checkout-title">Test checkout</h2>
      ${preview && sandboxCheckoutVisible ? `<section id="buyer-sandbox-status" aria-label="Sandbox checkout status" hidden>
        <p>Payment: <strong>Stripe TEST</strong></p>
        <p>Supplier pricing: <strong>TD SYNNEX sandbox/UAT</strong></p>
        <p>Supplier submission: <strong>held</strong></p>
        <p id="buyer-sandbox-status-message" role="status" aria-live="polite"></p>
      </section>` : ''}
      <p><strong>${scenario ? 'New test checkout destination' : 'Test delivery destination'}</strong> · ${destination}</p>
      <p id="buyer-checkout-status" role="status" aria-live="polite"></p>
      <form id="buyer-checkout-finalize" hidden>
        <h3>Review the test purchase terms</h3>
        <p id="buyer-checkout-review"></p>
        <details open>
          <summary>Test purchase terms</summary>
          <pre id="buyer-checkout-terms"></pre>
        </details>
        <label class="buyer-checkout-consent"><input type="checkbox" name="termsAccepted" required><span>I accept the displayed test purchase terms.</span></label>
        <label class="buyer-checkout-consent"><input type="checkbox" name="testConsent" required><span>I understand this is a private test and no product will be shipped.</span></label>
        <button type="submit">Calculate tax and prepare test order</button>
      </form>
      <article id="buyer-checkout-order" aria-labelledby="buyer-checkout-order-title" hidden>
        <h3 id="buyer-checkout-order-title" tabindex="-1"></h3>
        <p id="buyer-checkout-order-status" role="status"></p>
        <ul id="buyer-checkout-order-items" aria-label="Test order items"></ul>
        <dl class="buyer-checkout-totals">
          <div><dt>Item subtotal</dt><dd id="buyer-checkout-subtotal"></dd></div>
          <div><dt>Shipping</dt><dd id="buyer-checkout-shipping"></dd></div>
          <div><dt id="buyer-checkout-tax-label">${scenario ? 'Sales tax' : 'Florida sales tax'}</dt><dd id="buyer-checkout-tax"></dd></div>
          <div><dt>Total test payment</dt><dd id="buyer-checkout-total"></dd></div>
        </dl>
        <p id="buyer-checkout-expiry"></p>
        <form id="buyer-checkout-open" hidden>
          <label class="buyer-checkout-consent"><input type="checkbox" name="testConsent" required><span>I reviewed the total and will use Stripe test payment details.</span></label>
          <button type="submit">Open Stripe test checkout</button>
        </form>
        <button type="button" id="buyer-checkout-reconcile">Check Stripe payment status</button>
      </article>
      <div class="buyer-checkout-history">
        <h3>Your saved test orders</h3>
        <button type="button" id="buyer-checkout-history-reload">Reload orders</button>
        <p id="buyer-checkout-history-status" role="status"></p>
        <ul id="buyer-checkout-history-list"></ul>
        <button type="button" id="buyer-checkout-history-more" hidden>Load more orders</button>
      </div>
    </section>` : ''}
    <a href="/marketplace/account" id="buyer-signin-retry" hidden>Reload sign-in</a>
    <noscript>Enable JavaScript to use customer sign-in.</noscript>
  </main>
</body>
</html>`;
}
