import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopHandler } from '../api/shop.js';
import { createShopService } from '../lib/shop-cart-service.mjs';
import { memoryProductStore } from '../lib/product-controls-store.mjs';
import { memoryCartStore } from '../lib/shop-cart-store.mjs';
import { memorySmartStore } from '../lib/smart-pricing-store.mjs';
import { memoryMarketPriceStore } from '../lib/market-price-store.mjs';
import { memoryCheckoutStore, CHECKOUT_NOTICE } from '../lib/checkout-draft.mjs';

const now = Date.parse('2026-11-23T12:00:00.000Z');
const checkedAt = new Date(now).toISOString();
const owner = '44444444-4444-4444-8444-444444444444';
const sandboxEnv = {
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/td-product-controls',
  TP_MARKETPLACE_TD_SANDBOX_ONLY: 'true', TP_TD_UAT_CLIENT_ID: 'test-client',
  TP_TD_UAT_CLIENT_SECRET: 'test-secret', TP_TD_UAT_CUSTOMER_NO: '123456',
  TP_TD_UAT_ACCOUNT_CURRENCY: 'USD'
};

function item() {
  return { id: 'TD-12345', sku: '12345', mfgPart: 'PART-12345', manufacturer: 'EXAMPLE',
    description: 'Test item', category: 'laptops', categoryConfirmed: true, condition: 'new',
    decision: 'draft', review: { resaleConfirmed: true, contentConfirmed: true }, lastCheckFailure: null };
}

async function serviceFor(environment, { freightEnvironment = environment } = {}) {
  const products = memoryProductStore();
  const saved = await products.read();
  saved.state.items = [item()];
  saved.state.revision = 1;
  await products.save(saved.state, saved.etag);
  const calls = { lookup: 0, freight: 0 };
  const td = {
    lookup: async selectors => {
      calls.lookup++;
      return selectors.map(({ sku }) => ({ source: 'tdsynnex-priceavailability', environment,
        checkedAt, sku, mfgPart: 'PART-' + sku, status: 'Active', priceType: 'REGULAR',
        identityMatched: true, currency: 'USD', costCents: 10000, stockQuantity: 8,
        parcelShippable: true, endUserRequired: false, issues: [] }));
    },
    freight: async ({ zip }) => {
      calls.freight++;
      return { source: 'tdsynnex-freightquote', environment: freightEnvironment, checkedAt, zip, currency: 'USD',
        amountCents: 900, extraChargesComplete: true, shipmentCount: 1 };
    }
  };
  const service = createShopService({ env: { ...sandboxEnv }, td,
    products, cartStore: memoryCartStore(), settings: memorySmartStore(),
    marketStore: memoryMarketPriceStore(), clock: () => now });
  return { service, calls };
}

test('sandbox-bound cart accepts only UAT supplier observations and UAT freight evidence', async () => {
  const { service, calls } = await serviceFor('uat');
  const added = await service.change(owner, { action: 'add', sku: '12345', quantity: 1, zip: '34748', revision: 0 });
  assert.equal(calls.lookup, 1);
  assert.equal(calls.freight, 1);
  assert.equal(added.items[0].unitPriceCents, 11500);
  assert.equal(added.deliveryEstimateCents, 900);
  const diagnostics = await service.diagnostics(owner);
  assert.equal(diagnostics.checkoutEnabled, false);
});

test('sandbox-bound cart rejects production observations and does not accept production freight', async () => {
  const { service, calls } = await serviceFor('production');
  const added = await service.change(owner, { action: 'add', sku: '12345', quantity: 1, zip: '34748', revision: 0 });
  assert.equal(calls.lookup, 1);
  assert.equal(calls.freight, 0);
  assert.equal(added.items[0].unitPriceCents, null);
  assert.equal(added.deliveryEstimateCents, null);
});

test('sandbox-bound cart rejects production freight even when the UAT item observation is valid', async () => {
  const { service, calls } = await serviceFor('uat', { freightEnvironment: 'production' });
  const added = await service.change(owner, { action: 'add', sku: '12345', quantity: 1, zip: '34748', revision: 0 });
  assert.equal(calls.lookup, 1);
  assert.equal(calls.freight, 1);
  assert.equal(added.items[0].unitPriceCents, 11500);
  assert.equal(added.deliveryEstimateCents, null);
  assert.equal(added.deliveryStatus, 'pending');
});

test('sandbox service defaults to UAT despite global production TD overrides and omits production transport construction', async () => {
  const env = { ...sandboxEnv, TP_TD_API_ENVIRONMENT: 'production', TP_TD_PRODUCTION_READS_APPROVED: 'true' };
  const products = memoryProductStore();
  const saved = await products.read();
  saved.state.items = [item()];
  saved.state.revision = 1;
  await products.save(saved.state, saved.etag);
  const service = createShopService({ env, products, cartStore: memoryCartStore(), settings: memorySmartStore(),
    marketStore: memoryMarketPriceStore(), clock: () => now });
  const diag = await service.diagnostics(owner);
  assert.equal(diag.td.supplierEnvironment, 'uat');
  assert.equal(diag.td.productionSupplierPricingEnabled, false);
  assert.equal(diag.td.prepared, true);
});

test('missing explicit UAT USD confirmation keeps config readable and prevents injected transport reads', async () => {
  const env = { ...sandboxEnv };
  delete env.TP_TD_UAT_ACCOUNT_CURRENCY;
  const products = memoryProductStore();
  const saved = await products.read();
  saved.state.items = [item()];
  saved.state.revision = 1;
  await products.save(saved.state, saved.etag);
  let providerReads = 0;
  const td = { lookup: async () => { providerReads++; return []; }, freight: async () => { providerReads++; return null; },
    configuration: () => ({ environment: 'production', enabled: true }) };
  const service = createShopService({ env, products, cartStore: memoryCartStore(), settings: memorySmartStore(),
    marketStore: memoryMarketPriceStore(), td, clock: () => now });
  const diag = await service.diagnostics(owner);
  assert.equal(diag.td.prepared, false);
  assert.equal(diag.td.currencyConfirmed, false);
  assert.equal(diag.td.reason, 'explicit-uat-usd-confirmation-required');
  const result = await service.change(owner, { action: 'add', sku: '12345', quantity: 1, revision: 0 });
  assert.equal(providerReads, 0);
  assert.equal(result.items[0].unitPriceCents, null);
  assert.equal(result.subtotalCents, null);
});

test('sandbox hides a stored production quote and rejects a pre-sandbox prepared review', async () => {
  const env = { VERCEL_ENV: 'preview' };
  const products = memoryProductStore(), cartStore = memoryCartStore(), checkoutStore = memoryCheckoutStore();
  const saved = await products.read();
  saved.state.items = [item()];
  saved.state.revision = 1;
  await products.save(saved.state, saved.etag);
  const legacyTd = {
    lookup: async () => [{ source: 'tdsynnex-priceavailability', environment: 'production', checkedAt,
      sku: '12345', mfgPart: 'PART-12345', status: 'Active', priceType: 'REGULAR', identityMatched: true,
      currency: 'USD', costCents: 10000, stockQuantity: 8, parcelShippable: true, endUserRequired: false, issues: [] }],
    freight: async ({ zip }) => ({ source: 'tdsynnex-freightquote', environment: 'production', checkedAt, zip,
      currency: 'USD', amountCents: 900, extraChargesComplete: true, shipmentCount: 1 })
  };
  const options = { env, products, cartStore, checkoutStore, settings: memorySmartStore(),
    marketStore: memoryMarketPriceStore(), clock: () => now };
  const legacy = createShopService({ ...options, td: legacyTd });
  await legacy.change(owner, { action: 'add', sku: '12345', quantity: 1, zip: '34748', revision: 0 });
  const requestId = '55555555-5555-4555-8555-555555555555';
  await legacy.prepareCheckout(owner, { requestId, revision: 1,
    contact: { name: 'Synthetic Buyer', email: 'buyer@example.invalid', organization: '', phone: '' },
    address: { line1: '123 Test Street', line2: '', city: 'Leesburg', state: 'FL', postalCode: '34748', country: 'US' },
    noticeVersion: CHECKOUT_NOTICE, consent: true });

  const sandbox = createShopService({ ...options, env: sandboxEnv, td: {
    lookup: async () => { throw Error('unexpected UAT read'); },
    freight: async () => { throw Error('unexpected UAT freight read'); }
  }});
  const cart = await sandbox.read(owner);
  assert.equal(cart.items[0].unitPriceCents, null);
  assert.equal(cart.subtotalCents, null);
  await assert.rejects(sandbox.readCheckout(owner, requestId), error => error.status === 409);
  await assert.rejects(sandbox.finalizationSource(owner, requestId), error => error.status === 409);
});

test('shared, account and scenario carts use the UAT reader and suppress account pricing overrides', async () => {
  const host = 'tri-point-government-solutions-preview-tri-point.vercel.app';
  const issuer = Buffer.from('sandbox.clerk.accounts.dev$').toString('base64').replace(/=+$/, '');
  const scenario = {
    approvedAt: '2026-11-23T12:00:00Z', expiresAt: '2026-11-23T13:00:00Z',
    products: ['12345', '23456'].map(sku => ({ sku, manufacturerPart: 'PART-' + sku, quantity: 1, taxCode: 'txcd_12345678' })),
    address: { line1: '123 Example Street', city: 'Example', state: 'GA', postalCode: '30301', country: 'US' },
  };

  for (const withScenario of [false, true]) {
    const env = { ...sandboxEnv, VERCEL_URL: host, TP_BUYER_AUTH_PREVIEW_ENABLED: 'true',
      TP_MARKETPLACE_ACCOUNT_TEST_CHECKOUT_ENABLED: 'true', TP_MARKETPLACE_LENOVO_TEST_DELIVERY_ENABLED: 'true',
      TP_MARKETPLACE_LENOVO_TEST_COSTS: '{}', CLERK_SECRET_KEY: 'sk_test_1234567890123456',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + issuer,
      ...(withScenario ? { TP_MARKETPLACE_CART_TEST_SCENARIO: JSON.stringify(scenario) } : {}) };
    const calls = [];
    const handler = createShopHandler({ env, rate: async () => {}, makeBuyerShop: options => {
      calls.push(options);
      return {};
    }});
    if (withScenario) assert.equal(calls.length, 1, 'prepare the scenario only when a buyer opens the account');
    const res = { setHeader() {}, end() {} };
    await handler({ method: 'GET', url: '/api/shop?view=marketplace-buyer-sign-in',
      headers: { host, 'user-agent': 'test' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 2);
    const [shared, buyer] = calls;
    assert.equal(shared.td, buyer.td);
    assert.equal(shared.cartTestScenario, undefined);
    assert.deepEqual(buyer.cartTestScenario?.products, withScenario ? scenario.products : undefined);
    assert.equal(buyer.env.TP_MARKETPLACE_LENOVO_TEST_DELIVERY_ENABLED, 'false');
    for (const options of calls) {
      assert.equal(options.supplierEnvironment, 'uat');
      assert.equal(options.settings, undefined);
      const config = options.td.configuration();
      assert.equal(config.enabled, true);
      assert.equal(config.productionSupplierPricingEnabled, false);
      assert.equal(config.supplierSubmissionEnabled, false);
    }
  }
});
