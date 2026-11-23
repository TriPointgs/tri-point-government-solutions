import { BUSINESS_ADDRESS } from './business-address.mjs';
import { createCartCheckoutService } from './cart-checkout-service.mjs';
import { createFinalOrderStore, finalizationOrderId } from './final-order-store.mjs';
import { accountCartOwner } from './marketplace-account-cart.mjs';
import { HttpError } from './model.mjs';
import {
  createMarketplaceCartTestPolicy, MARKETPLACE_CART_TEST_TERMS_VERSION, matchesMarketplaceCartTest
} from './marketplace-cart-test-policy.mjs';
import { fields, orderId } from './order-extension-store.mjs';

const SKU = '14784711';
const PART = '13B90032US';
const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

function exactDesktop(lines, address) {
  const { streetAddress, addressLocality, addressRegion, postalCode, addressCountry } = BUSINESS_ADDRESS;
  const line = lines?.[0];
  return Array.isArray(lines) && lines.length === 1 && line?.sku === SKU && line.manufacturerPart === PART &&
    normalize(line.manufacturer) === 'LENOVO' &&
    line.quantity === 1 && normalize(address?.line1) === normalize(streetAddress) && !normalize(address?.line2) &&
    normalize(address?.city) === normalize(addressLocality) && address?.state === addressRegion &&
    address.postalCode === postalCode && address.country === addressCountry;
}

export async function assertMarketplaceAccountTestReview(shop, owner, reviewId, scenario) {
  const source = await shop.finalizationSource(orderId(owner), orderId(reviewId));
  const matches = scenario
    ? matchesMarketplaceCartTest(source?.lines, source?.address, scenario)
    : exactDesktop(source?.lines, source?.address);
  if (source?.mode !== 'test' || source.owner !== owner || source.reviewId !== reviewId || !matches) {
    throw new HttpError(409, scenario
      ? 'Prepare a fresh review for the approved products and delivery address.'
      : 'Prepare a current review for one Lenovo desktop at the approved Leesburg test destination.');
  }
}

function assertSavedOrder(record, owner, id, account) {
  const order = record?.order;
  const multiCart = order?.termsVersion === MARKETPLACE_CART_TEST_TERMS_VERSION;
  const matches = multiCart
    ? record.privateAddress?.country === 'US' && record.privateAddress.state !== 'FL' && order.lines?.length >= 2
    : exactDesktop(order?.lines, record?.privateAddress);
  if (record?.owner !== owner || record.phase !== 'finalized' || record.mode !== 'test' ||
      record.id !== id || order?.id !== id || order.kind !== 'payable-order' || order.mode !== 'test' ||
      finalizationOrderId(account, owner, record.reviewId) !== id || !matches ||
      order.taxStatus !== 'calculated' || !/^[a-f0-9]{64}$/.test(order.taxEvidence ?? '') ||
      !Number.isSafeInteger(order.taxCents) || order.taxCents < (multiCart ? 0 : 1)) {
    throw new HttpError(404, 'Test order not found.');
  }
  return record;
}

function assertCurrentTestCart(record, scenario) {
  const { order, privateAddress } = record;
  const multiCart = order.termsVersion === MARKETPLACE_CART_TEST_TERMS_VERSION;
  if (Boolean(scenario) !== multiCart ||
      (scenario && !matchesMarketplaceCartTest(order.lines, privateAddress, scenario))) {
    throw new HttpError(409, 'This order belongs to a different test scenario. Check its saved payment status.');
  }
}

function orderView(order, id) {
  const items = order?.items;
  const skus = new Set();
  if (order?.mode !== 'test' || order.id !== id || order.currency !== 'USD' || !Array.isArray(items) ||
      items.length < 1 || items.length > 20 || !items.every(item => {
        if (!item || typeof item.sku !== 'string' || !/^[1-9]\d{0,11}$/.test(item.sku) || skus.has(item.sku) ||
            typeof item.manufacturerPart !== 'string' || !item.manufacturerPart ||
            typeof item.title !== 'string' || !item.title ||
            !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999 ||
            !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 1) return false;
        skus.add(item.sku);
        return true;
      }) || items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0) !== order.subtotalCents) {
    throw new HttpError(503, 'The saved checkout could not be verified.');
  }
  return {
    id: order.id,
    reference: order.reference,
    mode: 'test',
    status: order.status,
    checkoutState: order.checkoutState,
    items: items.map(({ sku, manufacturerPart, title, quantity, unitPriceCents }) => ({ sku, manufacturerPart, title, quantity, unitPriceCents })),
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    currency: 'USD',
    quoteExpiresAt: order.quoteExpiresAt,
    needsRecheck: order.needsRecheck === true,
    releaseStopped: order.releaseStopped === true,
    captureConfirmed: order.captureConfirmed === true,
    paymentGatePassed: order.paymentGatePassed === true,
    paymentRecordSaved: order.paymentRecordSaved === true,
    liveCheckoutEnabled: false,
    supplierOrderSubmitted: false
  };
}

export function createMarketplaceAccountCheckout({
  env = process.env,
  access,
  shop,
  orders = createFinalOrderStore({ env }),
  cartTestScenario,
  checkout = createCartCheckoutService({ env, shop, orders, checkoutReturnPath: '/marketplace/account',
    ...(cartTestScenario ? { policies: createMarketplaceCartTestPolicy({ env, scenario: cartTestScenario }) } : {})
  })
}) {
  async function ownerFor(req) {
    if (env.VERCEL_ENV !== 'preview' || env.TP_MARKETPLACE_ACCOUNT_TEST_CHECKOUT_ENABLED !== 'true') {
      throw new HttpError(503, 'Account checkout is unavailable on this deployment.');
    }
    return accountCartOwner((await access.checkoutIdentity(req)).accountKey);
  }

  async function assertOwnedOrder(owner, id) {
    return assertSavedOrder((await orders.read(orderId(id)))?.record, owner, id, env.TP_STRIPE_TEST_ACCOUNT_ID);
  }

  return {
    async configuration(req) {
      await ownerFor(req);
      const config = await checkout.configuration();
      const { version, digest, text } = config.terms ?? {};
      const ready = config.mode === 'test' && config.ready === true && typeof version === 'string' &&
        /^[a-f0-9]{64}$/.test(digest ?? '') && typeof text === 'string' && text.trim() !== '';
      return { mode: 'test', ready, paymentEnabled: ready, historyReady: config.historyReady === true,
        terms: ready ? { version, digest, text } : null, liveCheckoutEnabled: false };
    },

    async finalize(req, input) {
      const owner = await ownerFor(req);
      fields(input, ['reviewId', 'termsVersion', 'termsDigest', 'termsAccepted', 'testConsent']);
      if (input.termsAccepted !== true || input.testConsent !== true ||
          typeof input.termsVersion !== 'string' || !/^[A-Za-z0-9_.-]{3,80}$/.test(input.termsVersion) ||
          typeof input.termsDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.termsDigest)) {
        throw new HttpError(400, 'Accept the approved terms and confirm this private checkout test.');
      }
      const id = finalizationOrderId(env.TP_STRIPE_TEST_ACCOUNT_ID, owner, orderId(input.reviewId));
      const saved = await orders.read(id);
      if (saved?.record.phase === 'finalized') {
        const record = assertSavedOrder(saved.record, owner, id, env.TP_STRIPE_TEST_ACCOUNT_ID);
        assertCurrentTestCart(record, cartTestScenario);
      } else {
        await assertMarketplaceAccountTestReview(shop, owner, input.reviewId, cartTestScenario);
      }
      const result = await checkout.finalize(owner, input);
      assertCurrentTestCart(await assertOwnedOrder(owner, id), cartTestScenario);
      return orderView(result, id);
    },

    async open(req, input) {
      const owner = await ownerFor(req);
      fields(input, ['orderId', 'testConsent']);
      if (input.testConsent !== true) throw new HttpError(400, 'Confirm opening private test checkout.');
      const id = orderId(input.orderId);
      assertCurrentTestCart(await assertOwnedOrder(owner, id), cartTestScenario);
      const result = await checkout.open(owner, input, {
        beforePayment: async () => {
          if (await ownerFor(req) !== owner) throw new HttpError(401, 'Sign in to the original marketplace account.');
        }
      });
      const view = orderView(result, id);
      if (result.checkoutState !== 'open') return view;
      if (typeof result.checkoutURL !== 'string' || !result.checkoutURL.startsWith('https://checkout.stripe.com/')) {
        throw new HttpError(503, 'The test checkout link could not be verified.');
      }
      return { ...view, checkoutURL: result.checkoutURL };
    },

    async reconcile(req, input) {
      const owner = await ownerFor(req);
      fields(input, ['orderId']);
      const id = orderId(input.orderId);
      await assertOwnedOrder(owner, id);
      return orderView(await checkout.reconcile(owner, input), id);
    },

    async read(req, id) {
      const owner = await ownerFor(req);
      await assertOwnedOrder(owner, id);
      return orderView(await checkout.read(owner, id), id);
    },

    async history(req, cursor) {
      const owner = await ownerFor(req);
      const page = await checkout.history(owner, cursor);
      const records = await Promise.all(page.records.map(async row => {
        await assertOwnedOrder(owner, row.id);
        return { id: row.id, reference: row.reference, status: row.status, totalCents: row.totalCents,
          currency: 'USD', createdAt: row.createdAt, captureConfirmed: row.captureConfirmed === true };
      }));
      return { mode: 'test', records, cursor: page.cursor, hasMore: page.hasMore === true };
    }
  };
}