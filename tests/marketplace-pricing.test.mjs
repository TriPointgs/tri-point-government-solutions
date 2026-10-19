import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MARKUP_BPS,PricingError,validatePricingPolicy,calculateMarketplacePrice} from '../lib/marketplace-pricing.mjs';
const NOW=Date.parse('2026-10-18T12:00:00.000Z');
const sample=(over={})=>({
 distributorCostCents:10000,currency:'USD',sku:'2688220',
 mfgPart:'PC6-6IN-GRN-S',manufacturer:'LENOVO',category:'laptops',
 costVerification:{verified:true,environment:'production',source:'tdsynnex-priceavailability',
   status:'Active',resaleAuthorized:true,pricedAt:new Date(NOW).toISOString()},...over
});
const quote=(product=sample(),policy={})=>calculateMarketplacePrice(product,policy,{nowMs:NOW});

test('default markup is 15%, so $100 cost becomes $115 sale',()=>{
 assert.equal(DEFAULT_MARKUP_BPS,1500);
 const p=quote();
 assert.equal(p.sellPriceCents,11500);
 assert.equal(p.grossProfitCents,1500);
 assert.equal(p.grossMarginBps,1304);
 assert.equal(p.rule,'default');
});
test('prices round half up using integer cents',()=>{
 assert.equal(quote(sample({distributorCostCents:103})).sellPriceCents,118);
 assert.equal(quote(sample({distributorCostCents:110})).sellPriceCents,127);
});
test('SKU overrides manufacturer, category and default',()=>{
 const r={categoryMarkups:{Laptops:1200},manufacturerMarkups:{lenovo:1800},skuMarkups:{'2688220':2200}};
 assert.equal(quote(sample(),r).sellPriceCents,12200);
 assert.equal(quote(sample(),r).rule,'product-sku');
 assert.equal(quote(sample({sku:'OTHER'}),r).markupBps,1800);
 assert.equal(quote(sample({sku:'OTHER',manufacturer:'Dell'}),r).markupBps,1200);
 assert.equal(quote(sample({sku:'OTHER',manufacturer:'Dell',category:'desktop'}),r).markupBps,1500);
});
test('manufacturer part is a product-level override',()=>{
 const r={manufacturerPartMarkups:{'pc6-6in-grn-s':900},manufacturerMarkups:{LENOVO:1800}};
 assert.equal(quote(sample({sku:'OTHER'}),r).markupBps,900);
 assert.equal(quote(sample({sku:'OTHER'}),r).rule,'product-manufacturer-part');
});
test('zero markup with configured minimum gross profit causes a hold',()=>{
 const r=quote(sample(),{skuMarkups:{'2688220':0},minimumGrossProfitCents:100});
 assert.equal(r.sellPriceCents,10000);
 assert.equal(r.pricingHeld,true);
 assert.equal(r.holdReason,'minimum-gross-profit');
});
test('sandbox, stale, unauthorized and unverified costs cannot be priced',()=>{
 for(const change of [{environment:'uat'},{verified:false},{status:'Inactive'},
   {resaleAuthorized:false},{source:'catalog-raw-field'},
   {pricedAt:new Date(NOW-900001).toISOString()},
   {pricedAt:new Date(NOW+31000).toISOString()},
   {pricedAt:undefined}]){
   assert.throws(()=>quote(sample({costVerification:{...sample().costVerification,...change}})),PricingError);
 }
 assert.throws(()=>quote(sample({costVerification:undefined})),PricingError);
});
test('freshness boundary of 15 minutes is accepted',()=>{
 assert.equal(quote(sample({costVerification:{...sample().costVerification,
   pricedAt:new Date(NOW-900000).toISOString()}})).sellPriceCents,11500);
});
test('invalid amounts, rules, currency and identity are rejected',()=>{
 for(const amount of [0,-1,1.3,'10000',Number.MAX_SAFE_INTEGER]){
   assert.throws(()=>quote(sample({distributorCostCents:amount})),PricingError);
 }
 for(const policy of [{defaultMarkupBps:-1},{defaultMarkupBps:10001},
  {defaultMarkupBps:15.5},{manufacturerMarkups:{LENOVO:100,lenovo:200}},
  {skuMarkups:{'unsafe\nsku':100}},{unknown:true}]){
   assert.throws(()=>validatePricingPolicy(policy),PricingError);
 }
 assert.throws(()=>quote(sample({currency:'EUR'})),PricingError);
 assert.throws(()=>quote(sample({sku:'',mfgPart:''})),PricingError);
});
test('calculation is not checkout authorization and excludes freight/taxes/fees',()=>{
 const r=quote();
 assert.equal(r.requiresCheckoutAndFulfillmentValidation,true);
 assert.equal(r.shippingTaxesAndFeesIncluded,false);
 assert.equal(Object.isFrozen(r),true);
});
