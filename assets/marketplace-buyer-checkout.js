export const buyerOrderIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function checkoutReturnSelection(url) {
  const query = url.searchParams;
  const id = query.get('order');
  const canceled = query.get('canceled');
  if (url.pathname !== '/marketplace/account' || !buyerOrderIdPattern.test(id || '') ||
      query.getAll('order').length !== 1 || query.getAll('canceled').length > 1 ||
      (canceled !== null && canceled !== '1') ||
      [...query.keys()].some(key => key !== 'order' && key !== 'canceled')) return null;
  return { id, canceled: canceled === '1' };
}

const openStates = new Set(['not-started', 'creating', 'open']);
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const time = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  second: '2-digit', timeZoneName: 'short'
});
const validMoney = value => Number.isSafeInteger(value) && value >= 0;
const validReference = order => buyerOrderIdPattern.test(order?.id || '') &&
  order.reference === 'TP-TEST-ORDER-' + order.id.slice(0, 8).toUpperCase();
const amount = value => dollars.format(value / 100);

function orderItemsMatchSubtotal(items, subtotalCents) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) return false;
  const seen = new Set();
  let total = 0;
  for (const item of items) {
    if (typeof item?.sku !== 'string' || !/^[1-9]\d{0,11}$/.test(item.sku) || seen.has(item.sku) ||
        typeof item.manufacturerPart !== 'string' || !item.manufacturerPart.trim() || item.manufacturerPart.length > 110 ||
        typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999 ||
        !validMoney(item.unitPriceCents) || item.unitPriceCents === 0) return false;
    seen.add(item.sku);
    total += item.quantity * item.unitPriceCents;
  }
  return Number.isSafeInteger(total) && total === subtotalCents;
}

function orderStatus(order) {
  if (order.captureConfirmed === true && order.paymentGatePassed === true) return 'Stripe verified the test payment for this order.';
  if (order.captureConfirmed === true || order.status === 'captured-review-required')
    return 'Stripe found a test payment. Tri-Point needs to review this order before any further action.';
  if (order.checkoutState === 'paid-session' || order.paymentRecordSaved === true || order.status === 'payment-needs-recheck')
    return 'Test payment verification is pending. Check the status of this order before making another payment.';
  if (order.releaseStopped === true || order.status === 'checkout-needs-review')
    return 'This test order is on hold. Check the existing payment status or contact Tri-Point.';
  if (order.needsRecheck === true || Date.parse(order.quoteExpiresAt) <= Date.now() || order.status === 'requote-required' ||
      order.checkoutState === 'expired' || order.status === 'checkout-expired')
    return 'This test quote expired. You can still check the payment status.';
  if (order.checkoutState === 'open') return 'A Stripe test session is saved for this order.';
  if (order.checkoutState === 'creating') return 'The Stripe test session is being checked. Use this same order if you retry.';
  return 'Awaiting a Stripe test payment.';
}

function stripeTestUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' &&
        !url.port && !url.username && !url.password && /^\/(?:[cg]\/)?pay\/cs_test_[A-Za-z0-9]+\/?$/.test(url.pathname)) {
      return url.href;
    }
  } catch { /* Unexpected URLs must remain unopened. */ }
  throw new Error('The Stripe test checkout link could not be verified. Check this same order before trying again.');
}

export function createBuyerCheckout({ runRequest }) {
  const element = id => document.getElementById('buyer-checkout' + id);
  const panel = element('');
  const finalizeForm = element('-finalize');
  const orderCard = element('-order');
  const orderTitle = element('-order-title');
  const orderItems = element('-order-items');
  const taxLabel = element('-tax-label');
  const defaultTaxLabel = taxLabel.textContent;
  const openForm = element('-open');
  const reconcile = element('-reconcile');
  const status = element('-status');
  const sandboxPanel = document.getElementById('buyer-sandbox-status');
  const sandboxMessage = document.getElementById('buyer-sandbox-status-message');
  const historyStatus = element('-history-status');
  const historyList = element('-history-list');
  const reload = element('-history-reload');
  const more = element('-history-more');
  let enabled = false;
  let busy = false;
  let config;
  let review;
  let order;
  let finalizedReviewId;
  let historyCursor;
  let expiryTimer;

  function canOpen() {
    return config?.ready === true && order && !order.needsRecheck && !order.releaseStopped &&
      !order.captureConfirmed && !order.paymentRecordSaved && openStates.has(order.checkoutState) &&
      Date.parse(order.quoteExpiresAt) > Date.now();
  }

  function controls({ busy: nextBusy = busy, review: nextReview = review } = {}) {
    if (nextReview?.id !== review?.id) finalizeForm.reset();
    busy = nextBusy;
    review = nextReview;
    panel.hidden = !enabled;
    const hasReview = review && !review.needsRecheck && review.id !== finalizedReviewId;
    finalizeForm.hidden = !enabled || config?.ready !== true || !hasReview;
    finalizeForm.querySelector('button').disabled = busy;
    element('-review').textContent = hasReview ? 'Saved review ' + review.reference + ' · ' +
      amount(review.subtotalCents) + ' in products · Estimated shipping ' + amount(review.deliveryEstimateCents) : '';
    openForm.hidden = !enabled || !canOpen();
    openForm.querySelector('button').disabled = busy;
    reconcile.disabled = busy || !order;
    reload.disabled = busy || config?.historyReady !== true;
    more.hidden = !historyCursor;
    more.disabled = busy;
    for (const button of historyList.querySelectorAll('button')) button.disabled = busy;
  }

  function reset() {
    clearTimeout(expiryTimer);
    enabled = false;
    config = review = order = finalizedReviewId = historyCursor = undefined;
    finalizeForm.reset();
    openForm.reset();
    for (const name of ['-terms', '-status', '-order-title', '-order-status', '-subtotal',
      '-shipping', '-tax', '-total', '-expiry', '-history-status']) element(name).textContent = '';
    if (sandboxPanel) sandboxPanel.hidden = true;
    if (sandboxMessage) sandboxMessage.textContent = '';
    historyList.replaceChildren();
    orderItems.replaceChildren();
    taxLabel.textContent = defaultTaxLabel;
    orderCard.hidden = true;
    controls({ busy: false });
  }

  function showConfiguration(result) {
    if (result?.mode !== 'test' || result.liveCheckoutEnabled !== false ||
        typeof result.ready !== 'boolean' || typeof result.historyReady !== 'boolean' ||
        (result.ready && (!result.terms || typeof result.terms.version !== 'string' ||
          !/^[a-f0-9]{64}$/.test(result.terms.digest || '') ||
          typeof result.terms.text !== 'string' || !result.terms.text.trim()))) {
      throw new Error('The test checkout configuration could not be verified.');
    }
    if (result.tdSandboxStatus !== undefined) {
      const sandbox = result.tdSandboxStatus;
      if (!sandboxPanel || !sandboxMessage || sandbox?.paymentLabel !== 'Stripe TEST' ||
          sandbox?.supplierLabel !== 'TD SYNNEX sandbox/UAT' ||
          sandbox?.submissionLabel !== 'Supplier submission held' || typeof sandbox.pricingReady !== 'boolean' ||
          !['Sandbox pricing is configured. Request a fresh quote from your cart.',
            'Sandbox pricing needs configuration and TD currency confirmation.'].includes(sandbox.message)) {
        throw new Error('The supplier sandbox status could not be verified.');
      }
      sandboxMessage.textContent = sandbox.message;
      sandboxPanel.hidden = false;
    }
    config = result;
    element('-terms').textContent = result.terms?.text || '';
    status.textContent = !result.ready ? 'New test payments are unavailable. You can check saved orders when order recovery is available.' :
      'Save or open a checkout review from your cart to see the purchase terms.';
    controls();
  }

  function showOrder(result, { expectedId, canceled = false, focus = true } = {}) {
    const flags = ['needsRecheck', 'releaseStopped', 'captureConfirmed', 'paymentGatePassed', 'paymentRecordSaved'];
    const fields = ['subtotalCents', 'shippingCents', 'taxCents', 'totalCents'];
    const expiry = Date.parse(result?.quoteExpiresAt);
    if (!validReference(result) || (expectedId && result.id !== expectedId) || result.mode !== 'test' ||
        result.currency !== 'USD' || result.liveCheckoutEnabled !== false || result.supplierOrderSubmitted !== false ||
        !flags.every(flag => typeof result[flag] === 'boolean') ||
        !fields.every(field => validMoney(result[field])) ||
        !orderItemsMatchSubtotal(result.items, result.subtotalCents) ||
        result.subtotalCents + result.shippingCents + result.taxCents !== result.totalCents ||
        !Number.isFinite(expiry)) throw new Error('This test order could not be verified.');
    openForm.reset();
    order = result;
    orderCard.hidden = false;
    orderTitle.textContent = result.reference;
    orderItems.replaceChildren(...result.items.map(item => {
      const row = document.createElement('li');
      row.textContent = item.quantity + ' × ' + item.title + ' · ' + item.manufacturerPart + ' · ' + amount(item.unitPriceCents * item.quantity);
      return row;
    }));
    taxLabel.textContent = result.items.length > 1 ? 'Sales tax' : defaultTaxLabel;
    element('-subtotal').textContent = amount(result.subtotalCents);
    element('-shipping').textContent = amount(result.shippingCents);
    element('-tax').textContent = amount(result.taxCents);
    element('-total').textContent = amount(result.totalCents);
    element('-expiry').textContent = 'Test quote expires ' + time.format(expiry) + '.';
    element('-order-status').textContent = orderStatus(result);
    status.textContent = canceled && !result.captureConfirmed ?
      'You returned from Stripe. Check the saved status before trying again.' : 'Saved test order loaded.';

    const url = new URL('/marketplace/account', window.location.origin);
    url.searchParams.set('order', result.id);
    window.history.replaceState(null, '', url);
    clearTimeout(expiryTimer);
    if (expiry > Date.now() && openStates.has(order.checkoutState)) {
      expiryTimer = setTimeout(() => {
        if (canOpen()) return;
        if (!order.captureConfirmed && !order.paymentRecordSaved && !order.releaseStopped)
          element('-order-status').textContent = 'This test quote expired. You can still check the payment status.';
        controls();
      }, Math.min(expiry - Date.now() + 100, 2_147_483_647));
    }
    controls();
    if (focus) orderTitle.focus();
  }

  function loadOrder(selection) {
    return runRequest('marketplace-buyer-checkout-order', { id: selection.id },
      result => showOrder(result, { expectedId: selection.id, canceled: selection.canceled }), status);
  }

  function loadHistory(cursor) {
    return runRequest('marketplace-buyer-checkout-history', { cursor }, result => {
      if (result?.mode !== 'test' || !Array.isArray(result.records) || !result.records.every(row =>
          validReference(row) && row.currency === 'USD' && validMoney(row.totalCents)) ||
          typeof result.hasMore !== 'boolean' ||
          (result.hasMore && (typeof result.cursor !== 'string' || !result.cursor || result.cursor === cursor))) {
        throw new Error('Saved test orders could not be verified.');
      }
      if (!cursor) historyList.replaceChildren();
      for (const row of result.records) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'View ' + row.reference;
        button.addEventListener('click', () => void loadOrder({ id: row.id }));
        li.append(button, document.createTextNode(' · ' + amount(row.totalCents) +
          (row.captureConfirmed === true ? ' · Test payment verified' : '')));
        historyList.append(li);
      }
      historyCursor = result.hasMore ? result.cursor : undefined;
      historyStatus.textContent = historyList.childElementCount ? '' : 'You have no saved test orders.';
    }, historyStatus);
  }

  async function activate(allowed, selection) {
    if (!allowed) {
      reset();
      return;
    }
    enabled = true;
    config = undefined;
    finalizeForm.reset();
    controls();
    await runRequest('marketplace-buyer-checkout-config', {}, showConfiguration, status);
    if (selection) await loadOrder(selection);
    if (config?.historyReady) await loadHistory();
  }

  finalizeForm.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || finalizeForm.hidden || !review || !finalizeForm.elements.termsAccepted.checked ||
        !finalizeForm.elements.testConsent.checked) return;
    const { id } = review;
    const { version, digest } = config.terms;
    void runRequest('marketplace-buyer-checkout-action', {
      data: { action: 'finalize', reviewId: id, termsVersion: version, termsDigest: digest,
        termsAccepted: true, testConsent: true }
    }, result => {
      showOrder(result);
      finalizedReviewId = id;
      finalizeForm.reset();
      controls();
    }, status).then(() => {
      if (finalizedReviewId === id && config?.historyReady) void loadHistory();
    });
  });

  openForm.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || !canOpen() || !openForm.elements.testConsent.checked) return;
    const id = order.id;
    void runRequest('marketplace-buyer-checkout-action', { data: { action: 'open', orderId: id, testConsent: true } },
      result => {
        showOrder(result, { expectedId: id });
        if (result.checkoutURL && result.checkoutState === 'open' && !result.captureConfirmed) {
          window.location.assign(stripeTestUrl(result.checkoutURL));
        }
      }, status);
  });

  reconcile.addEventListener('click', () => {
    if (busy || !order) return;
    const id = order.id;
    void runRequest('marketplace-buyer-checkout-action', { data: { action: 'reconcile', orderId: id } },
      result => showOrder(result, { expectedId: id, focus: false }), status);
  });
  reload.addEventListener('click', () => void loadHistory());
  more.addEventListener('click', () => { if (historyCursor) void loadHistory(historyCursor); });

  return { activate, controls, reset };
}
