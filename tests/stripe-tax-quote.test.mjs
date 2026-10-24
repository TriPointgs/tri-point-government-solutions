import test from 'node:test';
import assert from 'node:assert/strict';
import {stripeTaxConfig,taxCalculationRequest,validateTaxCalculation,createStripeTaxQuote} from '../lib/stripe-tax-quote.mjs';
import {env as baseEnv,now} from './payment-first-fixture.mjs';
const env={...baseEnv,TP_STRIPE_TAX_SETUP_APPROVED:'true',TP_STRIPE_TEST_TAX_ENABLED:'true'};
const order=()=>({lines:[{sku:'12345',quantity:2,unitPriceCents:11500,approvedTaxCode:'txcd_99999999'}],shippingCents:1250,
address:{line1:'123 Synthetic St',city:'Leesburg',state:'FL',postalCode:'34748',country:'US'}});
function mock(result={},options={}){
 const r=order(),p=taxCalculationRequest({...r,accountId:env.TP_STRIPE_TEST_ACCOUNT_ID});
 const cal={id:'taxcalc_SYNTHETIC123456',object:'tax.calculation',currency:'usd',tax_amount_exclusive:1800,tax_amount_inclusive:0,amount_total:26050,expires_at:(now+1800000)/1000,customer_details:{address:{...p.request.customer_details.address}},...result};
 const calls={account:0,calculate:0};return {calls,cal,plan:p,client:{accounts:{async retrieve(){calls.account++;return {id:options.accountId||env.TP_STRIPE_TEST_ACCOUNT_ID};}},tax:{calculations:{async create(input){calls.calculate++;assert.deepEqual(input,p.request);if(options.fail)throw Error('PRIVATE BANK TOKEN');return cal;}}}}};
}
test('tax is disabled until specifically reviewed, even when test Stripe keys are configured',()=>{
 assert.equal(stripeTaxConfig(baseEnv).enabled,false);
 for(const patch of [{TP_STRIPE_TAX_SETUP_APPROVED:'false'},{TP_STRIPE_TEST_TAX_ENABLED:'false'},{VERCEL_ENV:'production'},{TP_STRIPE_TEST_READS_ENABLED:'false'}])
  assert.equal(stripeTaxConfig({...env,...patch}).enabled,false);
});
test('customer address, Stripe account and per-item tax code must be fully supplied by the server',()=>{
 const base=order();
 for(const bad of [{lines:[{...base.lines[0],approvedTaxCode:undefined}]},{lines:[{...base.lines[0],quantity:0}]},{shippingCents:-1},{address:{...base.address,postalCode:'1234'}},{address:{...base.address,country:'CA'}},{lines:[]}])
  assert.throws(()=>taxCalculationRequest({...base,accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,...bad}),e=>e.status===400);
});
test('tax calculation does not use client-provided tax amount or pricing overrides',()=>{
 const r=taxCalculationRequest({...order(),accountId:env.TP_STRIPE_TEST_ACCOUNT_ID});
 assert.equal(r.request.line_items[0].amount,23000);
 assert.equal(r.request.shipping_cost.amount,1250);
 assert.equal(r.request.currency,'usd');
 assert.equal(r.request.customer_details.address_source,'shipping');
 assert.equal(r.request.line_items[0].tax_behavior,'exclusive');
 assert.equal(r.request.line_items[0].tax_code,'txcd_99999999');
 assert.ok(!Object.hasOwn(r.request,'amount_total'));
});
test('a successful validated calculation yields immutable tax evidence and TTL',()=>{
 const m=mock(),out=validateTaxCalculation(m.cal,m.plan,{now});
 assert.equal(out.taxCents,1800);assert.equal(out.totalCents,26050);assert.match(out.taxEvidence,/^[a-f0-9]{64}$/);
 assert.equal(out.addressDigest,m.plan.addressDigest);assert.equal(out.taxStatus,'calculated');assert.equal(out.exemptionReviewed,false);
 assert.doesNotMatch(JSON.stringify(out),/Synthetic St|buyer|sk_test_/);
});
test('invalid, expired, altered currency/address or incomplete tax data never convert to zero-tax checkout',()=>{
 for(const result of [{currency:'eur'},{amount_total:24250},{tax_amount_exclusive:null},{tax_amount_inclusive:5},{expires_at:1},{expires_at:null},{customer_details:{address:{country:'US',postal_code:'00000'}}},{id:'other'}]){
  const m=mock(result);assert.throws(()=>validateTaxCalculation(m.cal,m.plan,{now}),e=>e.status===503);
 }
});
test('merchant mismatch prevents tax API requests',async()=>{
 const m=mock({}, {accountId:'acct_OTHER1234'});
 const q=createStripeTaxQuote({env,stripeClient:m.client,clock:()=>now});
 await assert.rejects(q.calculate(order()),e=>e.status===503);assert.equal(m.calls.calculate,0);
});
test('disabled production or missing tax registration approval prevents any Stripe call',async()=>{
 for(const patch of [{VERCEL_ENV:'production'},{TP_STRIPE_TAX_SETUP_APPROVED:''},{TP_STRIPE_TEST_TAX_ENABLED:'false'}]){
  const m=mock(),q=createStripeTaxQuote({env:{...env,...patch},stripeClient:m.client,clock:()=>now});
  await assert.rejects(q.calculate(order()),e=>e.status===503);assert.equal(m.calls.account,0);
 }
});
test('Stripe Tax API failure is not converted to an assumed tax of zero',async()=>{
 const m=mock({}, {fail:true}),q=createStripeTaxQuote({env,stripeClient:m.client,clock:()=>now});
 await assert.rejects(q.calculate(order()),e=>e.status===503&&!e.message.includes('PRIVATE'));assert.equal(m.calls.calculate,1);
});
test('test-only tax quote returns a checked amount for the specific address without enabling live collection',async()=>{
 const m=mock(),q=createStripeTaxQuote({env,stripeClient:m.client,clock:()=>now});
 const out=await q.calculate(order());assert.equal(out.taxCents,1800);assert.equal(q.configuration().liveTaxCollectionEnabled,false);assert.equal(q.configuration().automaticCustomerExemptionEnabled,false);assert.equal(m.calls.calculate,1);
});
test('same ZIP with a different street, city or state fails the tax-address evidence check',()=>{for(const patch of [{line1:'123 Other Street'},{city:'Other City'},{state:'CA'}]){const m=mock();m.cal.customer_details.address={...m.cal.customer_details.address,...patch};assert.throws(()=>validateTaxCalculation(m.cal,m.plan,{now}),e=>e.status===503);}});
