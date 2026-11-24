import { createClerkClient } from '@clerk/backend';
import { HttpError } from './model.mjs';
import { body, send } from './security.mjs';
import { createMarketplaceAccountAccess } from './marketplace-account-access.mjs';
import { createMarketplaceAccountCart } from './marketplace-account-cart.mjs';
import { createMarketplaceAccountCheckout } from './marketplace-account-checkout.mjs';
import { marketplaceCartTestScenario, matchesMarketplaceCartTest } from './marketplace-cart-test-policy.mjs';
import { createMarketplaceLenovoDelivery, lenovoTestDeliveryEnabled } from './marketplace-lenovo-delivery.mjs';
import { marketplaceBuyerSignInPage } from './marketplace-buyer-signin-page.mjs';
import { tdSandboxCheckoutConfiguration } from './td-sandbox-checkout-policy.mjs';
import { BUSINESS_ADDRESS } from './business-address.mjs';
import { CHECKOUT_NOTICE } from './checkout-draft.mjs';
import { cartId } from './shop-cart-store.mjs';

const BRANCH = 'feature/td-product-controls';
const PAGE = 'marketplace-buyer-sign-in';
const SESSION = 'marketplace-buyer-session';
const CART = 'marketplace-buyer-cart';
const REVIEW = 'marketplace-buyer-review';
const DELIVERY = 'marketplace-buyer-delivery';
const CHECKOUT_CONFIG = 'marketplace-buyer-checkout-config';
const CHECKOUT_ORDER = 'marketplace-buyer-checkout-order';
const CHECKOUT_HISTORY = 'marketplace-buyer-checkout-history';
const CHECKOUT_ACTION = 'marketplace-buyer-checkout-action';
const CHECKOUT_VIEWS = new Set([CHECKOUT_CONFIG, CHECKOUT_ORDER, CHECKOUT_HISTORY, CHECKOUT_ACTION]);
const ACCOUNT_PAGE_QUERY = new Set(['view', 'order', 'canceled', 'flow']);
const CLERK_RETURN_PARAMS = ['__clerk_handshake', '__clerk_handshake_nonce'];
const DESKTOP = { sku: '14784711', part: '13B90032US' };
const TEST_ADDRESS = {
  line1: BUSINESS_ADDRESS.streetAddress,
  city: BUSINESS_ADDRESS.addressLocality,
  state: BUSINESS_ADDRESS.addressRegion,
  postalCode: BUSINESS_ADDRESS.postalCode,
  country: BUSINESS_ADDRESS.addressCountry
};

function hasTestDesktop(cart) {
  return cart.itemCount === 1 && cart.items.length === 1 && cart.items[0].sku === DESKTOP.sku &&
    cart.items[0].partNumber.toUpperCase() === DESKTOP.part && cart.items[0].manufacturer.toUpperCase() === 'LENOVO';
}

function checkCartRevision(revision, snapshot) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new HttpError(400, 'Invalid cart revision.');
  if (revision !== snapshot.revision) throw new HttpError(409, 'Your cart changed. Reload it before continuing.');
}

async function updateCart(req, cart, scenario) {
  const input = await body(req, 1000);
  if (scenario) {
    const { action, revision, sku } = input;
    if (Object.keys(input).some(key => !['action', 'revision', 'sku'].includes(key)) ||
        !['add', 'remove', 'refresh'].includes(action) ||
        (action === 'refresh' ? sku !== undefined : !/^[1-9]\d{0,11}$/.test(sku ?? '') || typeof sku !== 'string')) {
      throw new HttpError(400, 'Invalid cart action.');
    }
    if (action !== 'add') return cart.change(req, input);
    const product = scenario.products.find(item => item.sku === sku);
    const snapshot = await cart.read(req);
    checkCartRevision(revision, snapshot);
    if (!product || snapshot.items.some(item => item.sku === sku)) {
      throw new HttpError(409, 'Add each product from the approved test cart once.');
    }
    return cart.change(req, { action, revision, sku, quantity: product.quantity, zip: scenario.address.postalCode });
  }
  if (Object.keys(input).some(key => !['action', 'revision'].includes(key)) ||
      !['add', 'remove', 'refresh'].includes(input.action)) throw new HttpError(400, 'Invalid cart action.');
  const { action, revision } = input;
  if (action === 'add') {
    const snapshot = await cart.read(req);
    checkCartRevision(revision, snapshot);
    if (snapshot.itemCount !== 0) throw new HttpError(409, 'This preview supports one Lenovo desktop per account cart.');
    return cart.change(req, { action, revision: snapshot.revision, sku: DESKTOP.sku, quantity: 1, zip: TEST_ADDRESS.postalCode });
  }
  if (action === 'remove') return cart.change(req, { action, revision, sku: DESKTOP.sku });
  return cart.change(req, { action, revision });
}

async function updateReview(req, cart, scenario) {
  const input = await body(req, 1000);
  if (input.action === 'discard' && Object.keys(input).every(key => ['action', 'id'].includes(key)))
    return cart.discardCheckout(req, cartId(input.id));
  if (input.action !== 'save' || input.consent !== true ||
      Object.keys(input).some(key => !['action', 'requestId', 'revision', 'consent'].includes(key)))
    throw new HttpError(400, 'Confirm this private test review before saving.');
  cartId(input.requestId);
  const snapshot = await cart.read(req);
  checkCartRevision(input.revision, snapshot);
  const address = scenario?.address ?? TEST_ADDRESS;
  if (scenario) {
    const lines = snapshot.items.map(({ partNumber, sku, quantity }) => ({ manufacturerPart: partNumber, sku, quantity }));
    if (!matchesMarketplaceCartTest(lines, address, scenario)) {
      throw new HttpError(409, 'Add the approved products and quantities before reviewing this test cart.');
    }
  } else if (!hasTestDesktop(snapshot)) {
    throw new HttpError(409, 'Add the Lenovo desktop to your cart before reviewing.');
  }
  return cart.prepareCheckout(req, {
    requestId: input.requestId,
    revision: snapshot.revision,
    consent: true,
    noticeVersion: CHECKOUT_NOTICE,
    contact: { name: 'Marketplace test buyer', email: 'buyer@example.invalid' },
    address
  });
}

export function buyerPreviewConfig(env) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== BRANCH ||
      env.TP_BUYER_AUTH_PREVIEW_ENABLED !== 'true') return null;

  const host = env.VERCEL_URL;
  if (!/^tri-point-government-solutions-[a-z0-9-]+-tri-point\.vercel\.app$/.test(host || '')) return null;

  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const encodedHost = /^pk_test_([A-Za-z0-9+/]{1,160}={0,2})$/.exec(publishableKey || '')?.[1];
  if (!/^sk_test_[A-Za-z0-9_-]{16,200}$/.test(secretKey || '') || !encodedHost) return null;

  const frontend = Buffer.from(encodedHost, 'base64').toString('utf8');
  const issuerHost = /^([a-z0-9-]+\.clerk\.accounts\.dev)\$$/.exec(frontend)?.[1];
  if (!issuerHost || Buffer.from(frontend, 'utf8').toString('base64').replace(/=+$/, '') !== encodedHost.replace(/=+$/, '')) return null;
  return { origin: 'https://' + host, host, issuer: 'https://' + issuerHost, publishableKey, secretKey };
}

export function buyerProductionConfig(env) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' || env.TP_BUYER_AUTH_PRODUCTION_ENABLED !== 'true') return null;

  const host = 'tripointgs.com';
  const issuerHost = 'clerk.tripointgs.com';
  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const encodedHost = /^pk_live_([A-Za-z0-9+/]{1,160}={0,2})$/.exec(publishableKey || '')?.[1];
  if (!/^sk_live_[A-Za-z0-9_-]{16,200}$/.test(secretKey || '') || !encodedHost ||
      encodedHost.replace(/=+$/, '') !== Buffer.from(issuerHost + '$').toString('base64').replace(/=+$/, '')) return null;
  return { origin: 'https://' + host, host, issuer: 'https://' + issuerHost, publishableKey, secretKey };
}

export function createClerkBuyerVerifier({ config, client }) {
  return async req => {
    const bearer = req.headers.authorization;
    if (req.headers.host !== config.host || typeof bearer !== 'string' || bearer.length > 8192 ||
        !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)) return null;

    // Pass only the explicit session token. Other Tri-Point cookies confer no buyer access.
    const request = new Request(config.origin + '/api/shop?view=' + SESSION, {
      headers: { authorization: bearer }
    });
    const state = await client.authenticateRequest(request, {
      authorizedParties: [config.origin],
      acceptsToken: 'session_token'
    });
    if (!state.isAuthenticated) return null;

    const { userId, sessionId, sessionClaims, actor } = state.toAuth();
    if (actor || sessionClaims?.act || sessionClaims?.iss !== config.issuer || sessionClaims?.azp !== config.origin ||
        !/^user_[A-Za-z0-9]{4,100}$/.test(userId || '') || !/^sess_[A-Za-z0-9]{4,100}$/.test(sessionId || '') ||
        sessionClaims.sub !== userId || sessionClaims.sid !== sessionId) return null;

    // Check the provider's current state before accepting the signed session.
    const session = await client.sessions.getSession(sessionId);
    if (session?.id !== sessionId || session.userId !== userId || session.status !== 'active' || session.actor) return null;

    const user = await client.users.getUser(userId);
    if (user?.id !== userId || user.banned === true || user.locked === true) return null;
    const primary = user.emailAddresses?.find(entry => entry.id === user.primaryEmailAddressId);
    return { issuer: config.issuer, subject: userId, active: true, emailVerified: primary?.verification?.status === 'verified' };
  };
}

function pageCsp(issuer) {
  const challenge = 'https://challenges.cloudflare.com';
  const protect = 'https://*.protect.clerk.com';
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' " + [issuer, challenge, protect].join(' '),
    "connect-src 'self' " + [issuer, protect + ':*', challenge, 'https://clerk-telemetry.com', 'https://*.clerk-telemetry.com'].join(' '),
    "frame-src " + [issuer, challenge, protect].join(' '),
    "img-src 'self' data: https://img.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join('; ');
}

async function finishPreviewSignIn(res, config, query, param, makeClient) {
  const cleanUrl = new URL('/marketplace/account', config.origin);
  for (const key of ['flow', 'order', 'canceled']) {
    if (query.has(key)) cleanUrl.searchParams.set(key, query.get(key));
  }
  const callback = new URL(cleanUrl);
  callback.searchParams.set(param, query.get(param));
  const client = makeClient({ secretKey: config.secretKey, publishableKey: config.publishableKey });
  const state = await client.authenticateRequest(new Request(callback, { headers: { accept: 'text/html' } }), {
    authorizedParties: [config.origin], acceptsToken: 'session_token'
  });
  // Clerk verifies the callback and creates its cookie directives. Only complete
  // the local return here. Buyer data still requires the usual verified bearer.
  const cookies = state.headers.getSetCookie();
  if (state.headers.get('location') !== cleanUrl.href || cookies.length === 0) {
    throw new HttpError(400, 'Sign-in could not be completed. Open the Marketplace account page and try again.');
  }
  res.setHeader('Set-Cookie', cookies);
  res.setHeader('Location', cleanUrl.pathname + cleanUrl.search);
  res.statusCode = 303;
  return res.end();
}

export function createMarketplaceBuyerAuthHandler({ env, rate, makeClient = createClerkClient, shop,
  makeCheckout = createMarketplaceAccountCheckout }) {
  const preview = buyerPreviewConfig(env);
  const config = preview || buyerProductionConfig(env);
  const checkoutEnabled = Boolean(preview && env.TP_MARKETPLACE_ACCOUNT_TEST_CHECKOUT_ENABLED === 'true' && shop);
  const hasCartScenario = Boolean(checkoutEnabled && env.TP_MARKETPLACE_CART_TEST_SCENARIO);
  const deliveryEnabled = Boolean(preview && shop && !hasCartScenario && lenovoTestDeliveryEnabled(env));
  const sandboxCheckoutVisible = Boolean(preview && env.TP_MARKETPLACE_TD_SANDBOX_ONLY === 'true');
  let access, cart, checkout, delivery;
  return async (req, res, view, query) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    try {
      const checkoutView = CHECKOUT_VIEWS.has(view);
      const accountView = view === PAGE || view === SESSION;
      const previewView = preview && ([CART, REVIEW].includes(view) || (checkoutEnabled && checkoutView) ||
        (deliveryEnabled && view === DELIVERY));
      if (!config || req.headers.host !== config.host || (!accountView && !previewView))
        throw new HttpError(404, 'Marketplace account feature is unavailable.');
      if (query.getAll('view').length !== 1 || query.get('view') !== view)
        throw new HttpError(400, 'Invalid marketplace sign-in request.');
      const cartTestScenario = hasCartScenario ? marketplaceCartTestScenario(env) : null;

      if (view === PAGE) {
        if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Open the marketplace sign-in page.');
        // Vercel forwards parameters from the human-facing account and Stripe return URLs.
        const returns = preview ? CLERK_RETURN_PARAMS.filter(key => query.has(key)) : [];
        if (returns.length) res.setHeader('Referrer-Policy', 'no-referrer');
        if ([...query.keys()].some(key => !(ACCOUNT_PAGE_QUERY.has(key) || returns.includes(key)) || query.getAll(key).length !== 1) ||
            (returns.length && (returns.length !== 1 || req.method !== 'GET' || !query.get(returns[0]))) ||
            (!preview && (query.has('order') || query.has('canceled'))) ||
            (query.has('flow') && query.get('flow') !== 'sign-up') ||
            (query.has('canceled') && (!query.has('order') || query.get('canceled') !== '1')))
          throw new HttpError(400, 'Invalid marketplace account page link.');
        if (query.has('order')) cartId(query.get('order'));
        if (returns.length) {
          await rate(req, 'marketplace-buyer-read', 60);
          return await finishPreviewSignIn(res, config, query, returns[0], makeClient);
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', pageCsp(config.issuer));
        res.setHeader('Referrer-Policy', 'same-origin');
        res.statusCode = 200;
        return res.end(req.method === 'HEAD' ? '' : marketplaceBuyerSignInPage({ issuer: config.issuer,
          publishableKey: config.publishableKey, preview: Boolean(preview), deliveryEnabled, cartTestScenario,
          sandboxCheckoutVisible }));
      }

      const identifier = (view === REVIEW && req.method === 'GET') || view === CHECKOUT_ORDER;
      const cursor = view === CHECKOUT_HISTORY && query.has('cursor');
      if (query.size !== (identifier || cursor ? 2 : 1) ||
          (identifier && query.getAll('id').length !== 1) || (cursor && query.getAll('cursor').length !== 1))
        throw new HttpError(400, 'Invalid marketplace sign-in request.');
      const writes = req.method === 'POST' && [CART, REVIEW, CHECKOUT_ACTION, DELIVERY].includes(view);
      if ((!writes && req.method !== 'GET') || ([CHECKOUT_ACTION, DELIVERY].includes(view) && !writes))
        throw new HttpError(405, 'Unsupported marketplace account request.');
      if ((writes || req.headers.origin !== undefined) && req.headers.origin !== config.origin)
        throw new HttpError(403, 'Open the marketplace account on this website.');
      await rate(req, writes ? 'marketplace-buyer-write' : 'marketplace-buyer-read', writes ? 10 : 60);
      if (!access) {
        const { secretKey, publishableKey } = config;
        const client = makeClient({ secretKey, publishableKey });
        access = createMarketplaceAccountAccess({ verifyBuyer: createClerkBuyerVerifier({ config, client }) });
        if (preview && shop) cart = createMarketplaceAccountCart({ access, shop });
      }
      if (view === SESSION) {
        await access.checkoutIdentity(req);
        return send(res, 200, { signedIn: true, emailVerified: true, paymentEnabled: checkoutEnabled,
          ...(deliveryEnabled ? { deliveryEnabled: true } : {}) });
      }
      if (checkoutView) {
        checkout ??= makeCheckout({ env, access, shop, ...(cartTestScenario ? { cartTestScenario } : {}) });
        if (view === CHECKOUT_CONFIG) {
          const checkoutConfig = { ...(await checkout.configuration(req)) };
          if (sandboxCheckoutVisible) {
            const sandbox = tdSandboxCheckoutConfiguration(env);
            checkoutConfig.tdSandboxStatus = {
              paymentLabel: 'Stripe TEST',
              supplierLabel: 'TD SYNNEX sandbox/UAT',
              submissionLabel: 'Supplier submission held',
              pricingReady: sandbox.supplierPricesEnabled,
              message: sandbox.supplierPricesEnabled
                ? 'Sandbox pricing is configured. Request a fresh quote from your cart.'
                : 'Sandbox pricing needs configuration and TD currency confirmation.'
            };
          }
          return send(res, 200, checkoutConfig);
        }
        if (view === CHECKOUT_ORDER) return send(res, 200, await checkout.read(req, query.get('id')));
        if (view === CHECKOUT_HISTORY) return send(res, 200, await checkout.history(req, query.get('cursor')));
        const { action, ...input } = await body(req, 1200);
        if (action === 'finalize') return send(res, 200, await checkout.finalize(req, input));
        if (action === 'open') return send(res, 200, await checkout.open(req, input));
        if (action === 'reconcile') return send(res, 200, await checkout.reconcile(req, input));
        throw new HttpError(400, 'Invalid marketplace checkout action.');
      }
      if (!cart) throw new HttpError(503, 'Account cart is unavailable.');
      if (view === DELIVERY) {
        delivery ??= createMarketplaceLenovoDelivery({ env, shop, cart });
        return send(res, 200, await delivery.estimate(req, await body(req, 1200)));
      }
      if (view === CART) return send(res, 200, await (writes ? updateCart(req, cart, cartTestScenario) : cart.read(req)));
      return send(res, 200, await (writes ? updateReview(req, cart, cartTestScenario) : cart.readCheckout(req, cartId(query.get('id')))));
    } catch (error) {
      if (error instanceof HttpError) {
        if (['checkout_in_progress', 'checkout_restart_required', 'checkout_discarded', 'checkout_request_conflict'].includes(error.checkoutCode))
          return send(res, error.status, { error: error.message, code: error.checkoutCode });
        return send(res, error.status, { error: error.message });
      }
      return send(res, 503, { error: 'Marketplace sign-in could not be verified.' });
    }
  };
}
