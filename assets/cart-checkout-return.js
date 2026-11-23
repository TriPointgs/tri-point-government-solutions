const query = new URL(location.href).searchParams;
const order = query.get('order');

async function readCheckout(view) {
  try {
    const url = '/api/shop?view=' + view + '&order=' + order;
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(4000)
    });
    if (response.ok) return await response.json();
  } catch {
    // The return page remains usable when the original checkout session is unavailable.
  }
  return null;
}

if (query.getAll('order').length === 1 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(order || '') &&
    [...query.keys()].every(key => ['order', 'canceled', 'view'].includes(key))) {
  // Same-origin reads can recover Strict cookies omitted from Stripe's cross-site navigation.
  const buyer = await readCheckout('cart-checkout-pay-return');
  if (buyer?.destination === '/buyer-preview/checkout') {
    location.replace('/buyer-preview/checkout');
  } else {
    const staff = await readCheckout('cart-checkout-order');
    if (staff?.id === order) location.replace('/shop-preview/checkout?order=' + order);
  }
}
