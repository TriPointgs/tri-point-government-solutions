import { HttpError } from './model.mjs';
import { DEFAULT_SMART_POLICY, fields, UNREVIEWED_CART_COSTS, validateCartDefaults, validateSmartPolicy } from './smart-pricing-model.mjs';
import { createSmartStore } from './smart-pricing-store.mjs';

const costKeys = Object.keys(UNREVIEWED_CART_COSTS).filter(key => key !== 'confirmed');

export function createLenovoTestPricingReader({ env, store = createSmartStore({ env }), multiCart = false }) {
  // Both cost profiles are private simulations. The shared settings stay read-only.
  const raw = multiCart ? env.TP_MARKETPLACE_CART_TEST_COSTS : env.TP_MARKETPLACE_LENOVO_TEST_COSTS;

  return {
    async settings() {
      let policy, cartDefaults;
      try {
        if (typeof raw !== 'string' || raw.length > 2000) throw Error('Invalid profile');
        const profile = fields(JSON.parse(raw), ['policy', 'cartDefaults'], 'Lenovo test pricing');
        const { minProfitCents, minMarginBps } = fields(profile.policy, ['minProfitCents', 'minMarginBps'], 'Lenovo test policy');
        policy = validateSmartPolicy({ ...DEFAULT_SMART_POLICY, minProfitCents, minMarginBps, settingsConfirmed: true });
        const costs = fields(profile.cartDefaults, costKeys, 'Lenovo test costs');
        cartDefaults = validateCartDefaults({ ...costs, confirmed: true });
      } catch {
        throw new HttpError(503, multiCart ? 'The multi-product test pricing configuration is unavailable.' : 'The approved Lenovo test pricing configuration is unavailable.');
      }

      const result = await store.settings();
      const { state } = result;
      return {
        ...result,
        state: {
          ...state,
          policy: { ...state.policy, minProfitCents: policy.minProfitCents, minMarginBps: policy.minMarginBps, settingsConfirmed: true },
          cartDefaults
        }
      };
    }
  };
}