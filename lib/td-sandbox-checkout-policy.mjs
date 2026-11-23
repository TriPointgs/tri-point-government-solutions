import { HttpError } from './model.mjs';
import { createTdReadonly } from './tdsynnex-readonly.mjs';

const BRANCH = 'feature/td-product-controls';
const UAT_API = 'https://api-uat.us.tdsynnex.com';
const UAT_TOKEN = 'https://sso.us.tdsynnex.com/oauth2/v1/token';
const UAT_KEYS = Object.freeze([
  'TP_TD_UAT_CLIENT_ID',
  'TP_TD_UAT_CLIENT_SECRET',
  'TP_TD_UAT_CUSTOMER_NO'
]);

/** Safe checkout-facing configuration. Never includes a credential value. */
export function tdSandboxCheckoutConfiguration(env = process.env) {
  const missing = UAT_KEYS.filter(key => typeof env[key] !== 'string' || env[key].length === 0);
  // Ignore the separate admin-catalog TP_TD_* connection. Only sandbox-owned
  // endpoint/environment overrides can change or disable this fixed UAT scope.
  const sandboxOverrideInvalid =
    (env.TP_TD_UAT_API_ENVIRONMENT !== undefined && env.TP_TD_UAT_API_ENVIRONMENT !== 'uat') ||
    (env.TP_TD_UAT_API_BASE !== undefined && env.TP_TD_UAT_API_BASE !== UAT_API) ||
    (env.TP_TD_UAT_TOKEN_URL !== undefined && env.TP_TD_UAT_TOKEN_URL !== UAT_TOKEN);
  const scopeAllowed = env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === BRANCH &&
    env.TP_MARKETPLACE_TD_SANDBOX_ONLY === 'true' && !sandboxOverrideInvalid;
  const currencyConfirmed = env.TP_TD_UAT_ACCOUNT_CURRENCY === 'USD';
  const prepared = scopeAllowed && missing.length === 0 && currencyConfirmed;

  return Object.freeze({
    mode: 'test',
    paymentEnvironment: 'stripe-test',
    supplierEnvironment: 'uat',
    enabled: prepared,
    prepared,
    supplierPricesEnabled: prepared,
    supplierSubmissionEnabled: false,
    productionSupplierPricingEnabled: false,
    currencyConfirmed,
    missing: Object.freeze(missing),
    reason: !scopeAllowed ? 'sandbox-scope-required' : missing.length ? 'uat-credentials-required' :
      !currencyConfirmed ? 'explicit-uat-usd-confirmation-required' : 'ready'
  });
}

export function assertTdSandboxCheckout(env = process.env) {
  const config = tdSandboxCheckoutConfiguration(env);
  if (!config.prepared) throw new HttpError(503, 'TD sandbox checkout pricing is not configured for this preview.');
  return config;
}

/**
 * Create a read-only TD adapter bound to the dedicated UAT credentials and USD
 * confirmation. Production credential variables are never read or forwarded.
 */
export function createTdSandboxReadonly({ env = process.env, fetcher = fetch, clock } = {}) {
  assertTdSandboxCheckout(env);
  const uatEnv = Object.freeze({
    TP_TD_CLIENT_ID: env.TP_TD_UAT_CLIENT_ID,
    TP_TD_CLIENT_SECRET: env.TP_TD_UAT_CLIENT_SECRET,
    TP_TD_CUSTOMER_NO: env.TP_TD_UAT_CUSTOMER_NO,
    TP_TD_API_ENVIRONMENT: 'uat',
    TP_TD_READONLY_ENABLED: 'true',
    TP_TD_ACCOUNT_CURRENCY: 'USD',
    TP_TD_PRODUCTION_READS_APPROVED: 'false',
    TP_TD_ORDER_STATUS_ENABLED: 'false'
  });
  return createTdReadonly({ env: uatEnv, fetcher, ...(clock ? { clock } : {}) });
}
