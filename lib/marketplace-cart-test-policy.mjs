import { createHash } from 'node:crypto';
import { validateCheckoutAddress } from './checkout-draft.mjs';
import { HttpError } from './model.mjs';
import { stripeMarketplaceConfiguration } from './stripe-payment-verifier.mjs';

export const MARKETPLACE_CART_TEST_TERMS_VERSION = 'marketplace-cart-sandbox-v1';
const TERMS = 'PRIVATE STRIPE SANDBOX TEST\n\nThis exercise uses the approved test items and delivery address. Use Stripe test payment details. No live charge, supplier purchase, inventory reservation or shipment is authorized.\n\nThese test terms are nonbinding and do not apply to customer purchases.';
const MAX_APPROVAL_MS = 86_400_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const branchIsPreview = env => env.VERCEL === '1' && env.VERCEL_ENV === 'preview' &&
  env.VERCEL_GIT_COMMIT_REF === 'feature/td-product-controls';
const unavailable = () => new HttpError(503, 'The approved test cart scenario is unavailable.');
const normalize = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : '';
const hasExactFields = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw unavailable();
  const ms = Date.parse(value);
  const canonical = Number.isFinite(ms) ? new Date(ms).toISOString() : '';
  if (canonical !== (value.length === 20 ? value.replace('Z', '.000Z') : value)) throw unavailable();
  return canonical;
}

function normalizeScenario(input) {
  if (!hasExactFields(input, ['approvedAt', 'expiresAt', 'products', 'address']) ||
      !Array.isArray(input.products) || input.products.length < 2 || input.products.length > 20) throw unavailable();

  const approvedAt = timestamp(input.approvedAt);
  const expiresAt = timestamp(input.expiresAt);
  const duration = Date.parse(expiresAt) - Date.parse(approvedAt);
  if (duration <= 0 || duration > MAX_APPROVAL_MS) throw unavailable();

  const seen = new Set();
  const products = Array.from(input.products, product => {
    if (!hasExactFields(product, ['sku', 'manufacturerPart', 'quantity', 'taxCode'])) throw unavailable();
    const { sku, quantity, taxCode } = product;
    const manufacturerPart = normalize(product.manufacturerPart);
    if (typeof sku !== 'string' || !/^[1-9]\d{0,11}$/.test(sku) || seen.has(sku) ||
        !/^[A-Z0-9][A-Z0-9._+/-]{0,99}$/.test(manufacturerPart) ||
        !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999 ||
        typeof taxCode !== 'string' || !/^txcd_\d{8}$/.test(taxCode)) throw unavailable();
    seen.add(sku);
    return Object.freeze({ sku, manufacturerPart, quantity, taxCode });
  }).sort((a, b) => a.sku.localeCompare(b.sku, 'en-US'));

  let address;
  try { address = validateCheckoutAddress(input.address); } catch { throw unavailable(); }
  const street = /^\d+[A-Z]?(?:-\d+[A-Z]?)?\s+(.+)$/iu.exec(address.line1)?.[1];
  const box = /\b(?:p[\s.]*o[\s.]*box|post\s+office\s+box)\b/i;
  if (address.state === 'FL' || /^(?:32[0-9]|33[0-9]|34[124679])\d{2}$/.test(address.postalCode) ||
      !street || !/\p{L}/u.test(street) || box.test(address.line1) || box.test(address.line2)) throw unavailable();

  return Object.freeze({ approvedAt, expiresAt, products: Object.freeze(products), address: Object.freeze(address) });
}

export function marketplaceCartTestScenario(env = process.env) {
  const raw = env.TP_MARKETPLACE_CART_TEST_SCENARIO;
  if (!branchIsPreview(env) || raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length > 8192) throw unavailable();
  try { return normalizeScenario(JSON.parse(raw)); } catch { throw unavailable(); }
}

export function matchesMarketplaceCartTest(lines, address, scenario) {
  if (!Array.isArray(scenario?.products) || !Array.isArray(lines) || lines.length !== scenario.products.length ||
      lines.length < 2 || lines.length > 20 || !scenario.address) return false;
  const remaining = new Map(scenario.products.map(product => [product.sku, product]));
  for (const line of lines) {
    const expected = remaining.get(line?.sku);
    if (!expected || line.quantity !== expected.quantity ||
        normalize(line.manufacturerPart) !== expected.manufacturerPart) return false;
    remaining.delete(line.sku);
  }
  let actual;
  try { actual = validateCheckoutAddress(address); } catch { return false; }
  return remaining.size === 0 && Object.keys(actual).every(key => normalize(actual[key]) === normalize(scenario.address[key]));
}

export function createMarketplaceCartTestPolicy({ env = process.env, scenario, clock = Date.now } = {}) {
  return {
    async read() {
      if (!branchIsPreview(env) || !stripeMarketplaceConfiguration(env).configured) throw unavailable();
      const approved = scenario === undefined ? marketplaceCartTestScenario(env) : scenario && normalizeScenario(scenario);
      const now = clock();
      if (!approved || !Number.isFinite(now) || Date.parse(approved.approvedAt) > now ||
          Date.parse(approved.expiresAt) <= now) throw unavailable();

      const stripeTestAccountId = env.TP_STRIPE_TEST_ACCOUNT_ID;
      const reviewEvidence = purpose => hash(JSON.stringify([MARKETPLACE_CART_TEST_TERMS_VERSION, stripeTestAccountId, approved, purpose]));
      return Object.freeze({
        schemaVersion: 1,
        kind: 'merchant-checkout-policy',
        mode: 'test',
        revision: 1,
        expiresAt: approved.expiresAt,
        stripeTestAccountId,
        scope: approved,
        terms: Object.freeze({ approved: true, version: MARKETPLACE_CART_TEST_TERMS_VERSION,
          text: TERMS, contentDigest: hash(TERMS), approvedAt: approved.approvedAt }),
        tax: Object.freeze({ reviewed: true, reviewEvidence: reviewEvidence('tax'),
          products: Object.freeze(approved.products.map(({ sku, manufacturerPart, taxCode }) =>
            Object.freeze({ sku, manufacturerPart, code: taxCode }))) }),
        shipping: Object.freeze({ approved: true, strategy: 'merchant-fixed-from-td-zip-quote',
          reviewEvidence: reviewEvidence('shipping') })
      });
    }
  };
}