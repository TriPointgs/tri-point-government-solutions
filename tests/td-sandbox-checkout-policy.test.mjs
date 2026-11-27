import test from 'node:test';
import { cartPaymentFixture } from './cart-checkout-fixture.mjs';
import { finalOrder } from './payment-first-fixture.mjs';
import { finalizationOrderId } from '../lib/final-order-store.mjs';
import { accountCartOwner } from '../lib/marketplace-account-cart.mjs';
import { createMarketplaceAccountCheckout } from '../lib/marketplace-account-checkout.mjs';
import { MARKETPLACE_CART_TEST_TERMS_VERSION } from '../lib/marketplace-cart-test-policy.mjs';
import assert from 'node:assert/strict';
import {
  assertTdSandboxCheckout,
  createTdSandboxReadonly,
  tdSandboxCheckoutConfiguration
} from '../lib/td-sandbox-checkout-policy.mjs';

const ready = Object.freeze({
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'feature/td-product-controls',
  TP_MARKETPLACE_TD_SANDBOX_ONLY: 'true',
  TP_TD_UAT_CLIENT_ID: 'uat-client-placeholder',
  TP_TD_UAT_CLIENT_SECRET: 'uat-secret-placeholder',
  TP_TD_UAT_CUSTOMER_NO: '123456',
  TP_TD_UAT_ACCOUNT_CURRENCY: 'USD'
});

test('only the explicitly approved preview sandbox is prepared; submission remains held', () => {
  const config = tdSandboxCheckoutConfiguration(ready);
  assert.deepEqual({
    mode: config.mode,
    paymentEnvironment: config.paymentEnvironment,
    supplierEnvironment: config.supplierEnvironment,
    prepared: config.prepared,
    supplierPricesEnabled: config.supplierPricesEnabled,
    supplierSubmissionEnabled: config.supplierSubmissionEnabled,
    productionSupplierPricingEnabled: config.productionSupplierPricingEnabled
  }, {
    mode: 'test', paymentEnvironment: 'stripe-test', supplierEnvironment: 'uat', prepared: true,
    supplierPricesEnabled: true, supplierSubmissionEnabled: false, productionSupplierPricingEnabled: false
  });
  assert.equal(assertTdSandboxCheckout(ready).prepared, true);
});

test('production, another branch, or missing explicit sandbox approval are rejected', () => {
  for (const patch of [
    { VERCEL_ENV: 'production' },
    { VERCEL_GIT_COMMIT_REF: 'main' },
    { TP_MARKETPLACE_TD_SANDBOX_ONLY: 'false' },
    { TP_TD_UAT_API_ENVIRONMENT: 'production' },
    { TP_TD_UAT_API_BASE: 'https://api.us.tdsynnex.com' },
    { TP_TD_UAT_TOKEN_URL: 'https://sso.example.test/token' }
  ]) {
    const config = tdSandboxCheckoutConfiguration({ ...ready, ...patch });
    assert.equal(config.prepared, false);
    assert.equal(config.supplierSubmissionEnabled, false);
    assert.throws(() => assertTdSandboxCheckout({ ...ready, ...patch }), { status: 503 });
  }
});

test('dedicated UAT credentials and an explicit USD account confirmation are required', () => {
  for (const key of ['TP_TD_UAT_CLIENT_ID', 'TP_TD_UAT_CLIENT_SECRET', 'TP_TD_UAT_CUSTOMER_NO']) {
    const env = { ...ready };
    delete env[key];
    const config = tdSandboxCheckoutConfiguration(env);
    assert.equal(config.prepared, false);
    assert.ok(config.missing.includes(key));
  }
  assert.equal(tdSandboxCheckoutConfiguration({ ...ready, TP_TD_UAT_ACCOUNT_CURRENCY: '' }).reason,
    'explicit-uat-usd-confirmation-required');
  assert.equal(tdSandboxCheckoutConfiguration({ ...ready, TP_TD_UAT_ACCOUNT_CURRENCY: 'EUR' }).prepared, false);
});

test('production credentials cannot fill missing UAT values or be read by the adapter factory', () => {
  const env = new Proxy({
    ...ready,
    TP_TD_UAT_CLIENT_ID: '',
    TP_TD_UAT_CLIENT_SECRET: '',
    TP_TD_CLIENT_ID: 'live-client-must-not-be-read',
    TP_TD_CLIENT_SECRET: 'live-secret-must-not-be-read',
    TP_TD_CUSTOMER_NO: '999999'
  }, { get(target, key) {
    if (typeof key === 'string' && ['TP_TD_CLIENT_ID', 'TP_TD_CLIENT_SECRET', 'TP_TD_CUSTOMER_NO'].includes(key)) {
      throw new Error('production supplier configuration was read');
    }
    return target[key];
  }});
  const config = tdSandboxCheckoutConfiguration(env);
  assert.equal(config.prepared, false);
  assert.deepEqual(config.missing, ['TP_TD_UAT_CLIENT_ID', 'TP_TD_UAT_CLIENT_SECRET']);
  assert.throws(() => createTdSandboxReadonly({ env }), { status: 503 });
});

test('safe configuration snapshots never expose UAT or production credential values', () => {
  const config = tdSandboxCheckoutConfiguration({
    ...ready,
    TP_TD_CLIENT_ID: 'live-client-sentinel',
    TP_TD_CLIENT_SECRET: 'live-secret-sentinel',
    TP_TD_CUSTOMER_NO: '999999'
  });
  const snapshot = JSON.stringify(config);
  for (const value of ['uat-client-placeholder', 'uat-secret-placeholder', 'live-client-sentinel', 'live-secret-sentinel']) {
    assert.equal(snapshot.includes(value), false);
  }
  assert.equal(config.supplierSubmissionEnabled, false);
});

test('separate admin read-only production configuration is ignored by the sandbox', () => {
  const env = {
    ...ready,
    TP_TD_CLIENT_ID: 'admin-catalog-client',
    TP_TD_CLIENT_SECRET: 'admin-catalog-secret',
    TP_TD_CUSTOMER_NO: '777777',
    TP_TD_API_ENVIRONMENT: 'production',
    TP_TD_PRODUCTION_READS_APPROVED: 'true',
    TP_TD_ACCOUNT_CURRENCY: 'EUR'
  };
  assert.equal(tdSandboxCheckoutConfiguration(env).prepared, true);
  assert.equal(createTdSandboxReadonly({ env, fetcher: async () => { throw new Error('network not expected'); }}).configuration().environment, 'uat');
});

test('adapter factory binds only dedicated credentials and pins read access to UAT', () => {
  const env = new Proxy({ ...ready }, { get(target, key) {
    if (typeof key === 'string' && ['TP_TD_CLIENT_ID', 'TP_TD_CLIENT_SECRET', 'TP_TD_CUSTOMER_NO'].includes(key)) {
      throw new Error('unrelated admin catalog credentials were read');
    }
    return target[key];
  }});
  const adapter = createTdSandboxReadonly({ env, fetcher: async () => { throw new Error('test must not make network requests'); }});
  assert.deepEqual(adapter.configuration(), {
    enabled: true, environment: 'uat', missing: [], currencyConfirmed: true,
    productionReadsApproved: false, readOnly: true, contractVersion: '2.8', maximumBatch: 100
  });
  assert.equal(adapter.orderStatusConfiguration().enabled, false);
  assert.equal(JSON.stringify(adapter.configuration()).includes('uat-secret-placeholder'), false);
});


test('unconfirmed UAT currency blocks new checkout while saved-order recovery remains available', async () => {
  const fixture = await cartPaymentFixture();
  assert.equal((await fixture.service.configuration()).ready, true);
  Object.assign(fixture.env, ready, { TP_TD_UAT_ACCOUNT_CURRENCY: '' });
  const config = await fixture.service.configuration();
  assert.equal(config.ready, false);
  assert.equal(config.historyReady, true);
  assert.ok(config.blockers.includes('TD sandbox pricing requires configuration and currency confirmation.'));
  await assert.rejects(fixture.finalize(), { status: 503 });
  assert.equal(fixture.counts.create, 0);
  assert.equal(fixture.taxCounts.tax, 0);
});

test('buyer can read the exact saved order during a UAT currency hold without contacting TD or Stripe', async t => {
  const fixture = await cartPaymentFixture({ patch: { ...ready, TP_MARKETPLACE_ACCOUNT_TEST_CHECKOUT_ENABLED: 'true' } });
  const { env, store, service } = fixture;
  const accountKey = 'a'.repeat(64);
  const access = { checkoutIdentity: async req => ({ accountKey: req.accountKey }) };
  const buyer = createMarketplaceAccountCheckout({ env, access, orders: store, checkout: service });
  const owner = accountCartOwner(accountKey);
  const reviewId = '11111111-1111-4111-8111-111111111111';
  const id = finalizationOrderId(env.TP_STRIPE_TEST_ACCOUNT_ID, owner, reviewId);
  const lines = [
    { sku: '301', manufacturerPart: 'SYN-A', description: 'Synthetic display', quantity: 2, unitPriceCents: 4500 },
    { sku: '302', manufacturerPart: 'SYN-B', description: 'Synthetic stand', quantity: 1, unitPriceCents: 1000 }
  ];
  await store.save(id, {
    schemaVersion: 1, kind: 'checkout-finalization', mode: 'test', phase: 'finalized', revision: 2,
    id, owner, reviewId, privateAddress: { line1: '123 Example St', city: 'Atlanta', state: 'GA', postalCode: '30301', country: 'US' },
    order: { ...finalOrder(), id, lines, subtotalCents: 10000, shippingCents: 500, taxCents: 600, totalCents: 11100,
      termsVersion: MARKETPLACE_CART_TEST_TERMS_VERSION, taxStatus: 'calculated' }
  }, null);

  const request = { accountKey };
  assert.equal((await buyer.configuration(request)).ready, true);
  delete env.TP_TD_UAT_ACCOUNT_CURRENCY;
  assert.equal((await buyer.configuration(request)).ready, false);
  await assert.rejects(service.finalize(owner, fixture.request),
    err => err.status === 503 && err.message.includes('currency confirmation'));

  // Record every external transport attempt, even if a caller swallows its error.
  const attempts = [];
  const forbid = label => () => { attempts.push(label); throw Error('Unexpected transport: ' + label); };
  t.mock.method(globalThis, 'fetch', forbid('fetch'));
  for (const [label, adapter] of Object.entries({
    td: fixture.td, account: fixture.client.accounts, session: fixture.client.checkout.sessions,
    intent: fixture.client.paymentIntents, charge: fixture.client.charges
  })) {
    for (const method of Object.keys(adapter)) t.mock.method(adapter, method, forbid(label + '.' + method));
  }
  const taxBefore = { ...fixture.taxCounts };
  const saved = await buyer.read(request, id);
  assert.equal(saved.id, id);
  assert.equal(saved.currency, 'USD');
  assert.equal(saved.totalCents, 11100);
  assert.deepEqual(saved.items.map(item => [item.sku, item.quantity, item.unitPriceCents]),
    [['301', 2, 4500], ['302', 1, 1000]]);
  assert.equal(saved.supplierOrderSubmitted, false);
  await assert.rejects(buyer.read({ accountKey: 'b'.repeat(64) }, id), { status: 404 });
  assert.deepEqual(attempts, []);
  assert.deepEqual(fixture.taxCounts, taxBefore);
});
