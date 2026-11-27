import { CHECKOUT_MAX_AGE_MS, validateCheckoutAddress } from './checkout-draft.mjs';
import { HttpError } from './model.mjs';

const SKU = '14784711';
const PART = '13B90032US';
// USPS L002 Florida prefixes. 340 is Armed Forces Americas, and 343, 345, and 348 are unassigned.
// https://pe.usps.com/archive/html/DMMArchive20110417/L002.htm
const floridaZip = /^(?:32[0-9]|33[0-9]|34[124679])\d{2}$/;
const numberedStreet = /^\d+[a-z]?(?:-\d+[a-z]?)?\s+(.+)$/iu;
const postOfficeBox = /\b(?:p[\s.]*o[\s.]*box|post\s+office\s+box)\b/i;

export function lenovoTestDeliveryEnabled(env = process.env) {
  return env.VERCEL === '1' && env.VERCEL_ENV === 'preview' &&
    env.VERCEL_GIT_COMMIT_REF === 'feature/td-product-controls' &&
    env.TP_MARKETPLACE_LENOVO_TEST_DELIVERY_ENABLED === 'true';
}

function floridaDeliveryZip(input) {
  const address = validateCheckoutAddress(input);
  if (address.state !== 'FL' || !floridaZip.test(address.postalCode)) {
    throw new HttpError(400, 'Enter a five-digit Florida ZIP code for this preview.');
  }
  const streetName = numberedStreet.exec(address.line1)?.[1];
  if (!streetName || !/\p{L}/u.test(streetName) ||
      postOfficeBox.test(address.line1) || postOfficeBox.test(address.line2)) {
    throw new HttpError(400, 'Enter a physical Florida street address.');
  }
  if (!/^\p{L}[\p{L}\p{M}.'’ -]+$/u.test(address.city)) {
    throw new HttpError(400, 'Enter the delivery city.');
  }
  return address.postalCode;
}

function isExactDesktop(line) {
  return line?.sku === SKU && line.quantity === 1 &&
    typeof line.partNumber === 'string' && line.partNumber.toUpperCase() === PART &&
    typeof line.manufacturer === 'string' && line.manufacturer.toUpperCase() === 'LENOVO';
}

function assertCart(snapshot, revision) {
  if (snapshot?.revision !== revision) throw new HttpError(409, 'Your cart changed. Reload it before checking shipping.');
  if (snapshot.itemCount !== 1 || !Array.isArray(snapshot.items) ||
      snapshot.items.length !== 1 || !isExactDesktop(snapshot.items[0])) {
    throw new HttpError(409, 'Add one Lenovo desktop to check shipping.');
  }
}

export function createMarketplaceLenovoDelivery({ env = process.env, shop, cart, clock = () => Date.now() }) {
  return {
    async estimate(req, input) {
      if (!lenovoTestDeliveryEnabled(env)) throw new HttpError(404, 'The delivery estimate is unavailable.');
      const snapshot = await cart.read(req);
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
          Object.keys(input).some(key => key !== 'revision' && key !== 'address') ||
          !Number.isSafeInteger(input.revision) || input.revision < 0) {
        throw new HttpError(400, 'Submit the current cart and a Florida delivery address.');
      }
      assertCart(snapshot, input.revision);
      const postalCode = floridaDeliveryZip(input.address);
      // The supplier's estimate takes the ZIP and item only. No full address is saved or transmitted.
      const offer = await shop.productOffer({ sku: SKU, quantity: 1, zip: postalCode });
      const checked = Date.parse(offer?.checkedAt);
      const expiry = Date.parse(offer?.validUntil);
      const now = clock();
      if (!isExactDesktop(offer) || offer?.preview !== true || offer.checkoutEnabled !== false ||
          offer.orderPlaced !== false || offer.zip !== postalCode || offer.availability !== 'available' ||
          offer.deliveryStatus !== 'estimated' || !Number.isSafeInteger(offer.deliveryEstimateCents) ||
          offer.deliveryEstimateCents < 0 || !Number.isFinite(checked) || checked > now + 30_000 ||
          !Number.isFinite(expiry) || expiry <= now || expiry <= checked || expiry - checked > CHECKOUT_MAX_AGE_MS) {
        throw new HttpError(409, 'A current supplier shipping estimate is unavailable. Check the address and try again.');
      }
      assertCart(await cart.read(req), input.revision);
      return {
        mode: 'test', sku: SKU, partNumber: PART, quantity: 1, postalCode,
        shippingEstimateCents: offer.deliveryEstimateCents,
        checkedAt: offer.checkedAt, expiresAt: offer.validUntil, paymentEnabled: false
      };
    }
  };
}