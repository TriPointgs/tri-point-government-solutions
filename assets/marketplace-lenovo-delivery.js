const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const localTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export function createLenovoDeliveryEstimate({ runRequest }) {
  const panel = document.getElementById('buyer-delivery-estimate');
  const form = document.getElementById('buyer-delivery-form');
  const status = document.getElementById('buyer-delivery-status');
  const fields = form.querySelector('fieldset');
  let enabled = false;
  let busy = false;
  let cart;

  function canCheck() {
    return enabled && !busy && cart?.itemCount === 1;
  }

  function controls({ enabled: nextEnabled = enabled, busy: nextBusy = busy, cart: nextCart = cart } = {}) {
    if (nextCart?.revision !== cart?.revision) status.textContent = '';
    enabled = nextEnabled;
    busy = nextBusy;
    cart = nextCart;
    panel.hidden = !enabled || cart?.itemCount !== 1;
    fields.disabled = !canCheck();
  }

  function reset() {
    enabled = busy = false;
    cart = undefined;
    form.reset();
    status.textContent = '';
    controls();
  }

  form.addEventListener('input', () => { status.textContent = ''; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!canCheck()) return;
    const revision = cart.revision;
    const input = new FormData(form);
    const address = {
      line1: input.get('line1').trim(),
      line2: (input.get('line2') || '').trim(),
      city: input.get('city').trim(),
      state: 'FL',
      postalCode: input.get('postalCode').trim(),
      country: 'US'
    };
    void runRequest('marketplace-buyer-delivery', { data: { revision, address } }, result => {
      const expiry = Date.parse(result?.expiresAt);
      if (cart?.revision !== revision || result?.mode !== 'test' || result.paymentEnabled !== false ||
          result.sku !== '14784711' || result.partNumber !== '13B90032US' || result.quantity !== 1 ||
          result.postalCode !== address.postalCode || !Number.isSafeInteger(result.shippingEstimateCents) ||
          result.shippingEstimateCents < 0 || !Number.isFinite(expiry) || expiry <= Date.now()) {
        throw new Error('The shipping estimate could not be verified.');
      }
      status.textContent = 'Estimated shipping to ZIP ' + result.postalCode + ' is ' +
        usd.format(result.shippingEstimateCents / 100) + ' through ' + localTime.format(expiry) + '. Final delivery requires confirmation.';
    }, status);
  });

  controls();
  return { controls, reset };
}