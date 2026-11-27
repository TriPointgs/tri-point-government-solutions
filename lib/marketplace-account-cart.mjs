import { createHash } from 'node:crypto';
import { HttpError } from './model.mjs';

export function accountCartOwner(accountKey) {
  if (typeof accountKey !== 'string' || !/^[a-f0-9]{64}$/.test(accountKey)) {
    throw new HttpError(503, 'Marketplace cart access could not be verified.');
  }

  // The existing cart and review stores require a v4-format UUID owner.
  const bytes = createHash('sha256')
    .update(JSON.stringify(['marketplace-buyer-cart-v1', accountKey]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

export function createMarketplaceAccountCart({ access, shop }) {
  async function owner(req) {
    const { accountKey } = await access.checkoutIdentity(req);
    return accountCartOwner(accountKey);
  }

  return {
    async read(req) {
      return shop.read(await owner(req));
    },
    async change(req, input) {
      return shop.change(await owner(req), input);
    },
    async prepareCheckout(req, input) {
      return shop.prepareCheckout(await owner(req), input);
    },
    async readCheckout(req, id) {
      return shop.readCheckout(await owner(req), id);
    },
    async discardCheckout(req, id) {
      return shop.discardCheckout(await owner(req), id);
    }
  };
}