// Internal calculations only. No network, checkout or order side effects.
// USD amounts are integer cents. 1500 basis points means a 15% markup.
export const DEFAULT_MARKUP_BPS = 1500;
const MAX_MARKUP_BPS = 10000;
const MAX_COST_CENTS = 1_000_000_000;
const POLICY_KEYS = new Set(['defaultMarkupBps','categoryMarkups','manufacturerMarkups','skuMarkups','manufacturerPartMarkups','minimumGrossProfitCents','maxPriceAgeSeconds']);

export class PricingError extends Error {
  constructor(message){ super(message); this.name='PricingError'; }
}
const invalid = msg => { throw new PricingError(msg); };
const record = x => x!==null && typeof x==='object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
function boundedInteger(x,name,min,max){
  if(!Number.isSafeInteger(x)||x<min||x>max) invalid('Invalid '+name+'.');
  return x;
}
function normalizedKey(x,name,optional=false){
  if(optional&&(x===undefined||x===null||x==='')) return '';
  if(typeof x!=='string') invalid('Invalid '+name+'.');
  const k=x.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,99}$/.test(k)) invalid('Invalid '+name+'.');
  return name==='category'?k.toLowerCase():k.toUpperCase();
}
function rulesMap(input,name){
  if(input===undefined) return Object.freeze(Object.create(null));
  if(!record(input)) invalid('Invalid '+name+' overrides.');
  const result=Object.create(null);
  for(const [raw,bps] of Object.entries(input)){
    const k=normalizedKey(raw,name);
    if(Object.hasOwn(result,k)) invalid('Duplicate '+name+' rule.');
    result[k]=boundedInteger(bps,name+' markup',0,MAX_MARKUP_BPS);
  }
  return Object.freeze(result);
}
export function validatePricingPolicy(input={}){
  if(!record(input)||Object.keys(input).some(k=>!POLICY_KEYS.has(k))) invalid('Invalid pricing policy.');
  return Object.freeze({
    defaultMarkupBps: boundedInteger(input.defaultMarkupBps??DEFAULT_MARKUP_BPS,'default markup',0,MAX_MARKUP_BPS),
    categoryMarkups: rulesMap(input.categoryMarkups,'category'),
    manufacturerMarkups: rulesMap(input.manufacturerMarkups,'manufacturer'),
    skuMarkups: rulesMap(input.skuMarkups,'SKU'),
    manufacturerPartMarkups: rulesMap(input.manufacturerPartMarkups,'manufacturer part'),
    minimumGrossProfitCents: boundedInteger(input.minimumGrossProfitCents??0,'minimum gross profit',0,MAX_COST_CENTS),
    maxPriceAgeSeconds: boundedInteger(input.maxPriceAgeSeconds??900,'maximum price age',30,3600)
  });
}
function selectMarkup(p,policy){
  const sku=normalizedKey(p.sku,'SKU',true);
  const part=normalizedKey(p.mfgPart,'manufacturer part',true);
  const maker=normalizedKey(p.manufacturer,'manufacturer',true);
  const category=normalizedKey(p.category,'category',true);
  if(!sku&&!part) invalid('A distributor SKU or manufacturer part number is required.');
  if(sku&&Object.hasOwn(policy.skuMarkups,sku)) return [policy.skuMarkups[sku],'product-sku'];
  if(part&&Object.hasOwn(policy.manufacturerPartMarkups,part)) return [policy.manufacturerPartMarkups[part],'product-manufacturer-part'];
  if(maker&&Object.hasOwn(policy.manufacturerMarkups,maker)) return [policy.manufacturerMarkups[maker],'manufacturer'];
  if(category&&Object.hasOwn(policy.categoryMarkups,category)) return [policy.categoryMarkups[category],'category'];
  return [policy.defaultMarkupBps,'default'];
}
function requireProductionEvidence(p,policy,nowMs){
  const v=p.costVerification;
  // Trust these fields ONLY from a server-side, authenticated, authorized price adapter.
  // Never pass visitor inputs or unverified historical catalog feed numbers here.
  if(!record(v)||v.verified!==true||v.environment!=='production'||
    v.source!=='tdsynnex-priceavailability'||v.status!=='Active'||
    v.resaleAuthorized!==true) invalid('Verified, authorized production distributor pricing is required.');
  if(typeof v.pricedAt!=='string') invalid('Missing distributor price timestamp.');
  const t=Date.parse(v.pricedAt);
  if(!Number.isFinite(t)||new Date(t).toISOString()!==v.pricedAt||
    t>nowMs+30000||nowMs-t>policy.maxPriceAgeSeconds*1000)
    invalid('Distributor price is stale or has an invalid timestamp.');
}
export function calculateMarketplacePrice(product,pricingPolicy={},options={}){
  if(!record(product)||!record(options)) invalid('Invalid pricing input.');
  const policy=validatePricingPolicy(pricingPolicy);
  const nowMs=boundedInteger(options.nowMs??Date.now(),'pricing clock',1,Number.MAX_SAFE_INTEGER);
  if(product.currency!=='USD') invalid('Only USD prices are supported.');
  const costCents=boundedInteger(product.distributorCostCents,'distributor cost',1,MAX_COST_CENTS);
  requireProductionEvidence(product,policy,nowMs);
  const [markupBps,rule]=selectMarkup(product,policy);
  const grossProfitCents=Math.floor((costCents*markupBps+5000)/10000);
  const sellPriceCents=costCents+grossProfitCents;
  if(!Number.isSafeInteger(sellPriceCents)) invalid('Price exceeds safe limits.');
  const held=grossProfitCents<policy.minimumGrossProfitCents;
  return Object.freeze({
    // Internal only: this contains confidential distributor cost.
    distributorCostCents:costCents,sellPriceCents,grossProfitCents,
    grossMarginBps:Math.floor(grossProfitCents*10000/sellPriceCents),
    markupBps,rule,currency:'USD',pricingHeld:held,
    holdReason:held?'minimum-gross-profit':null,
    shippingTaxesAndFeesIncluded:false,
    requiresCheckoutAndFulfillmentValidation:true
  });
}
