import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketplaceBuyerAuthHandler } from '../lib/marketplace-buyer-auth.mjs';

const host = 'tri-point-government-solutions-fixture-tri-point.vercel.app';
const page = 'marketplace-buyer-sign-in';
const env = {
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/td-product-controls', VERCEL_URL: host,
  TP_BUYER_AUTH_PREVIEW_ENABLED: 'true', CLERK_SECRET_KEY: 'sk_test_local_only_fixture_12345',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('fixture.clerk.accounts.dev$').toString('base64')
};

async function visit(params, authenticateRequest, { environment = env, domain = host, method = 'GET', view = page } = {}) {
  const req = { method, headers: { host: domain } };
  const res = { headers: new Map(), setHeader(key, value) { this.headers.set(key.toLowerCase(), value); }, end(body) { this.body = body; } };
  const handler = createMarketplaceBuyerAuthHandler({ env: environment, rate: async () => {}, makeClient: () => ({ authenticateRequest }) });
  await handler(req, res, view, new URLSearchParams([['view', view], ...params]));
  return res;
}

for (const param of ['__clerk_handshake', '__clerk_handshake_nonce']) {
  test(`preview completes Clerk's ${param} return and preserves the sign-up path`, async () => {
    const cookies = ['test_session=synthetic; Path=/; Secure', 'test_refresh=synthetic; Path=/; HttpOnly'];
    const res = await visit([[param, 'fixture'], ['flow', 'sign-up']], async (request, options) => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://' + host);
      assert.equal(url.pathname, '/marketplace/account');
      assert.equal(url.searchParams.get(param), 'fixture');
      assert.equal(url.searchParams.has('view'), false);
      assert.deepEqual(options.authorizedParties, [url.origin]);
      assert.equal(options.acceptsToken, 'session_token');
      const headers = new Headers({ location: url.origin + '/marketplace/account?flow=sign-up' });
      for (const cookie of cookies) headers.append('set-cookie', cookie);
      return { headers };
    });
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.get('location'), '/marketplace/account?flow=sign-up');
    assert.deepEqual(res.headers.get('set-cookie'), cookies);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.headers.get('cache-control'), /no-store/);
  });
}

test('only an unambiguous preview account-page GET reaches Clerk', async () => {
  const param = '__clerk_handshake';
  const prodEnv = { VERCEL: '1', VERCEL_ENV: 'production', TP_BUYER_AUTH_PRODUCTION_ENABLED: 'true',
    CLERK_SECRET_KEY: 'sk_live_local_only_fixture_12345', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_' + Buffer.from('clerk.tripointgs.com$').toString('base64') };
  let providerCalls = 0;
  const unexpected = async () => { providerCalls++; };
  for (const [params, options] of [
    [[[param, 'fixture'], [param, 'duplicate']], {}], [[[param, 'fixture'], ['__clerk_handshake_nonce', 'fixture']], {}],
    [[[param, 'fixture'], ['unexpected', '1']], {}], [[[param, '']], {}], [[[param, 'fixture']], { method: 'HEAD' }],
    [[[param, 'fixture']], { domain: 'other.example' }], [[[param, 'fixture']], { domain: 'tripointgs.com', environment: prodEnv }],
    [[[param, 'fixture']], { view: 'marketplace-buyer-session' }]
  ]) {
    const res = await visit(params, unexpected, options);
    assert.ok([400, 404].includes(res.statusCode));
    assert.equal(res.headers.has('set-cookie'), false);
  }
  assert.equal(providerCalls, 0);
});

test('an incomplete provider return writes no cookies or redirect', async () => {
  for (const headers of [new Headers(), new Headers({ location: 'https://other.example/', 'set-cookie': 'test=fixture' })]) {
    const res = await visit([['__clerk_handshake', 'fixture']], async () => ({ headers }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.headers.has('set-cookie'), false);
    assert.equal(res.headers.has('location'), false);
  }
});
