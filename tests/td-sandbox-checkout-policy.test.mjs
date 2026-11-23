import test from 'node:test';
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
  const { cartPaymentFixture } = await import('./cart-checkout-fixture.mjs');
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
