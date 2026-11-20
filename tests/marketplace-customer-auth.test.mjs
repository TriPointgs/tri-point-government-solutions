import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketplaceCustomerAuth, marketplaceCustomerConfig } from '../lib/marketplace-customer-auth.mjs';
import { HttpError } from '../lib/model.mjs';

const origin = 'https://tripointgs.com';
const issuer = 'https://clerk.tripointgs.com';
const userId = 'user_SyntheticBuyer';
const sessionId = 'sess_SyntheticSession';
const token = 'Bearer mock.token.signature';
const production = {
  VERCEL: '1', VERCEL_ENV: 'production', TP_BUYER_AUTH_PRODUCTION_ENABLED: 'true',
  CLERK_SECRET_KEY: 'sk_live_' + 'SyntheticOnlyNeverARealCredential',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_' + Buffer.from('clerk.tripointgs.com$').toString('base64')
};

const pageUrl = '/api/intake?channel=marketplace-account&view=page';
const sessionUrl = '/api/intake?channel=marketplace-account&view=session';

function fixture({ env = production, claims = {}, auth = {}, session = {}, user = {}, authenticate = true,
  emailState = 'verified', rateError, providerError } = {}) {
  const events = [];
  const client = {
    async authenticateRequest(request, options) {
      events.push('authenticate');
      assert.equal(request.url, origin + '/api/marketplace/account-session');
      assert.equal(request.headers.get('authorization'), token);
      assert.equal(request.headers.get('cookie'), null);
      assert.deepEqual(options, { authorizedParties: [origin], acceptsToken: 'session_token' });
      if (providerError) throw providerError;
      return { isAuthenticated: authenticate, toAuth: () => ({ userId, sessionId,
        sessionClaims: { iss: issuer, azp: origin, sid: sessionId, sub: userId, ...claims }, ...auth }) };
    },
    sessions: { async getSession(id) {
      events.push('session');
      assert.equal(id, sessionId);
      return { id, userId, status: 'active', ...session };
    } },
    users: { async getUser(id) {
      events.push('user');
      assert.equal(id, userId);
      return { id, primaryEmailAddressId: 'primary', emailAddresses: [
        { id: 'primary', verification: { status: emailState } },
        { id: 'secondary', verification: { status: 'verified' } }
      ], ...user };
    } }
  };
  const handler = createMarketplaceCustomerAuth({ env, makeClient: keys => {
    events.push('client');
    assert.deepEqual(keys, { secretKey: production.CLERK_SECRET_KEY, publishableKey: production.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
    return client;
  }, rate: async (_req, key, max) => {
    events.push('rate');
    assert.equal(key, 'marketplace-customer-session');
    assert.equal(max, 60);
    if (rateError) throw rateError;
  } });
  return {
    events,
    async call({ url = sessionUrl, method = 'GET', query, headers = {} } = {}) {
      const result = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
      await handler({ url, method, query, headers: { host: 'tripointgs.com', authorization: token, ...headers } }, result);
      return result;
    }
  };
}

test('production config requires Vercel production, an independent feature flag, and keys for the pinned Clerk instance', () => {
  const config = marketplaceCustomerConfig(production);
  assert.equal(config.host, 'tripointgs.com');
  assert.equal(config.origin, origin);
  assert.equal(config.issuer, issuer);
  for (const change of [
    { VERCEL: undefined }, { VERCEL_ENV: 'preview' }, { TP_BUYER_AUTH_PRODUCTION_ENABLED: undefined },
    { CLERK_SECRET_KEY: production.CLERK_SECRET_KEY.replace('sk_live_', 'sk_test_') },
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: production.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.replace('pk_live_', 'pk_test_') },
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_' + Buffer.from('clerk.tripointgs.com.example$').toString('base64') }
  ]) assert.equal(marketplaceCustomerConfig({ ...production, ...change }), null);
});

test('production account HTML allows a canonical signup link and never initializes Clerk or consumes the session rate limit', async () => {
  const f = fixture();
  const page = await f.call({ url: '/marketplace/account?flow=sign-up', query: { channel: 'marketplace-account', view: 'page' },
    headers: { authorization: undefined } });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['Content-Type'], /text\/html/);
  assert.match(page.headers['Cache-Control'], /no-store/);
  assert.match(page.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.ok(page.body.includes(production.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
  assert.ok(!page.body.includes(production.CLERK_SECRET_KEY));
  assert.doesNotMatch(page.body, /checkout\.stripe\.com|Add to cart|Pay now/);
  const head = await f.call({ url: pageUrl, method: 'HEAD' });
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, '');
  assert.deepEqual(f.events, []);
});

test('disabled deployments and unrecognized routes, hosts, origins, methods and query fields fail before provider work', async () => {
  const blocked = fixture({ env: { ...production, VERCEL_ENV: 'preview' } });
  assert.equal((await blocked.call({ url: pageUrl })).statusCode, 404);
  assert.deepEqual(blocked.events, []);
  const f = fixture();
  for (const host of ['www.tripointgs.com', 'tri-point-preview.vercel.app', 'clerk.tripointgs.com']) {
    assert.equal((await f.call({ headers: { host, 'x-forwarded-host': 'tripointgs.com' } })).statusCode, 404);
  }
  for (const otherOrigin of ['null', 'https://other.example', 'https://clerk.tripointgs.com']) {
    assert.equal((await f.call({ headers: { origin: otherOrigin } })).statusCode, 403);
  }
  for (const url of [sessionUrl + '&order=untrusted', sessionUrl + '&channel=marketplace-account', sessionUrl + '&view=session',
    sessionUrl + '&flow=sign-up', pageUrl + '&flow=other', pageUrl + '&returnTo=/contracts',
    '/marketplace/account?channel=marketplace-account&view=session', '/api/intake?channel=marketplace-account&view=checkout',
    '/mismatched?channel=marketplace-account&view=page']) {
    assert.equal((await f.call({ url })).statusCode, 400);
  }
  assert.equal((await f.call({ query: { view: ['session', 'session'] } })).statusCode, 400);
  assert.equal((await f.call({ query: { view: 'page' } })).statusCode, 400);
  assert.equal((await f.call({ method: 'POST' })).statusCode, 405);
  assert.equal((await f.call({ method: 'HEAD' })).statusCode, 405);
  assert.equal((await f.call({ headers: { authorization: undefined, cookie: '__Host-tp_admin=synthetic' } })).statusCode, 401);
  assert.equal((await f.call({ headers: { authorization: 'Bearer token-without-jwt-shape' } })).statusCode, 401);
  assert.deepEqual(f.events, []);
});

test('signed-in customer session is pinned to the canonical issuer and origin and returns status only', async () => {
  const f = fixture();
  const signedIn = await f.call({ url: '/api/marketplace/account-session',
    query: { channel: 'marketplace-account', view: 'session' }, headers: { origin, cookie: 'synthetic-staff' } });
  assert.equal(signedIn.statusCode, 200);
  assert.match(signedIn.headers['Cache-Control'], /no-store/);
  assert.equal(signedIn.headers['Set-Cookie'], undefined);
  assert.deepEqual(JSON.parse(signedIn.body), { signedIn: true, emailVerified: true, paymentEnabled: false });
  assert.deepEqual(f.events, ['rate', 'client', 'authenticate', 'session', 'user']);
});

test('unverified, inactive, cross-instance, and impersonated sessions never receive signed-in status', async () => {
  for (const options of [{ authenticate: false }, { claims: { iss: 'https://preview.clerk.accounts.dev' } },
    { claims: { azp: undefined } }, { claims: { azp: 'https://elsewhere.example' } }, { claims: { sub: 'user_Other' } },
    { claims: { sid: 'sess_Other' } }, { claims: { act: { sub: 'user_Actor' } } }, { auth: { actor: {} } }]) {
    const f = fixture(options);
    assert.equal((await f.call()).statusCode, 401);
    assert.deepEqual(f.events, ['rate', 'client', 'authenticate']);
  }
  for (const options of [{ session: { status: 'revoked' } }, { session: { userId: 'user_Other' } }, { session: { actor: {} } }]) {
    const f = fixture(options);
    assert.equal((await f.call()).statusCode, 401);
    assert.deepEqual(f.events, ['rate', 'client', 'authenticate', 'session']);
  }
  assert.equal((await fixture({ user: { banned: true } }).call()).statusCode, 401);
  assert.equal((await fixture({ user: { locked: true } }).call()).statusCode, 401);
  assert.equal((await fixture({ emailState: 'unverified' }).call()).statusCode, 403);
});

test('rate limit and unavailable Clerk fail closed and expose no provider information', async () => {
  const limited = fixture({ rateError: new HttpError(429, 'Too many attempts.') });
  assert.equal((await limited.call()).statusCode, 429);
  assert.deepEqual(limited.events, ['rate']);
  const unavailable = fixture({ providerError: new Error('private upstream details') });
  const result = await unavailable.call();
  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), { error: 'Marketplace sign-in could not be verified.' });
});
