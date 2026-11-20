import { createClerkClient } from '@clerk/backend';
import { marketplaceCustomerPage } from './marketplace-customer-page.mjs';
import { HttpError } from './model.mjs';
import { send } from './security.mjs';
import { limit } from './storage.mjs';

const HOST = 'tripointgs.com';
const ORIGIN = `https://${HOST}`;
const ISSUER_HOST = 'clerk.tripointgs.com';
const CHANNEL = 'marketplace-account';
const PAGE_PATH = '/marketplace/account';
const SESSION_PATH = '/api/marketplace/account-session';

export function marketplaceCustomerConfig(env = process.env) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' || env.TP_BUYER_AUTH_PRODUCTION_ENABLED !== 'true') return null;

  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const expectedKey = 'pk_live_' + Buffer.from(ISSUER_HOST + '$').toString('base64');
  if (!/^sk_live_[A-Za-z0-9_-]{16,200}$/.test(secretKey ?? '') ||
      (publishableKey !== expectedKey && publishableKey !== expectedKey.replace(/=+$/, ''))) return null;

  return { host: HOST, origin: ORIGIN, issuer: `https://${ISSUER_HOST}`, publishableKey, secretKey };
}

function accountView(req) {
  const invalid = () => new HttpError(400, 'Invalid marketplace account link.');
  const url = new URL(req.url, ORIGIN);
  const query = url.searchParams;
  for (const name of query.keys()) if (query.getAll(name).length !== 1) throw invalid();

  // Vercel can expose rewrite parameters through req.query or in req.url.
  for (const [name, value] of Object.entries(req.query ?? {})) {
    if (typeof value !== 'string' || (query.has(name) && query.get(name) !== value)) throw invalid();
    if (!query.has(name)) query.set(name, value);
  }

  const view = query.get('view');
  const path = view === 'page' ? PAGE_PATH : SESSION_PATH;
  if (url.origin !== ORIGIN || !['/api/intake', path].includes(url.pathname) ||
      query.get('channel') !== CHANNEL || !['page', 'session'].includes(view) ||
      [...query.keys()].some(name => name !== 'channel' && name !== 'view' && (view !== 'page' || name !== 'flow')) ||
      (query.has('flow') && query.get('flow') !== 'sign-up')) throw invalid();
  return view;
}

function pageCsp(issuer) {
  const challenge = 'https://challenges.cloudflare.com';
  const protect = 'https://*.protect.clerk.com';
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' ${issuer} ${challenge} ${protect}`,
    `connect-src 'self' ${issuer} ${protect}:* ${challenge} https://clerk-telemetry.com https://*.clerk-telemetry.com`,
    `frame-src ${issuer} ${challenge} ${protect}`,
    "img-src 'self' data: https://img.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join('; ');
}

const signInRequired = () => new HttpError(401, 'Sign in to your marketplace account.');

async function requireVerifiedCustomer(client, config, bearer) {
  // Pass only the explicit Clerk session token. Staff and contractor cookies confer no access.
  const request = new Request(config.origin + SESSION_PATH, { headers: { authorization: bearer } });
  const state = await client.authenticateRequest(request, {
    authorizedParties: [config.origin], acceptsToken: 'session_token'
  });
  if (!state.isAuthenticated) throw signInRequired();

  const { userId, sessionId, sessionClaims, actor } = state.toAuth();
  if (actor || sessionClaims?.act || sessionClaims?.iss !== config.issuer || sessionClaims?.azp !== config.origin ||
      !/^user_[A-Za-z0-9]{4,100}$/.test(userId ?? '') || !/^sess_[A-Za-z0-9]{4,100}$/.test(sessionId ?? '') ||
      sessionClaims.sub !== userId || sessionClaims.sid !== sessionId) throw signInRequired();

  const session = await client.sessions.getSession(sessionId);
  if (session?.id !== sessionId || session.userId !== userId || session.status !== 'active' || session.actor) throw signInRequired();

  const user = await client.users.getUser(userId);
  if (user?.id !== userId || user.banned === true || user.locked === true) throw signInRequired();
  const primary = user.emailAddresses?.find(entry => entry.id === user.primaryEmailAddressId);
  if (primary?.verification?.status !== 'verified') throw new HttpError(403, 'Verify your marketplace account email.');
}

export function createMarketplaceCustomerAuth({ env = process.env, rate = limit, makeClient = createClerkClient } = {}) {
  const config = marketplaceCustomerConfig(env);
  let client;
  return async function marketplaceCustomerAuth(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      if (!config || req.headers.host !== config.host) throw new HttpError(404, 'Marketplace accounts are unavailable.');
      const view = accountView(req);
      if (req.headers.origin !== undefined && req.headers.origin !== config.origin) {
        throw new HttpError(403, 'Open your marketplace account on this website.');
      }
      if (view === 'page') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD');
          throw new HttpError(405, 'Open the marketplace account page.');
        }
        const { issuer, publishableKey } = config;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', pageCsp(issuer));
        return res.end(req.method === 'HEAD' ? '' : marketplaceCustomerPage({ issuer, publishableKey }));
      }

      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        throw new HttpError(405, 'Use GET to check your marketplace sign-in.');
      }
      const bearer = req.headers.authorization;
      if (typeof bearer !== 'string' || bearer.length > 8192 ||
          !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)) throw signInRequired();
      await rate(req, 'marketplace-customer-session', 60);
      client ??= makeClient({ secretKey: config.secretKey, publishableKey: config.publishableKey });
      await requireVerifiedCustomer(client, config, bearer);
      return send(res, 200, { signedIn: true, emailVerified: true, paymentEnabled: false });
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      return send(res, 503, { error: 'Marketplace sign-in could not be verified.' });
    }
  };
}

export default createMarketplaceCustomerAuth();
