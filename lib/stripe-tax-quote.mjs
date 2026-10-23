// Sandbox-only, server-controlled Stripe Tax calculation. Never treats an unconfigured tax account as zero tax.
import Stripe from 'stripe';
import {createHash} from 'node:crypto';
import {HttpError} from './model.mjs';
import {stripeTestConfiguration} from './stripe-payment-verifier.mjs';
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY NY'.split(' '));
const normalized=x=>String(x||'').trim().replace(/\s+/g,' ').toUpperCase();
const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=99999999;
const digest=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const fail=(message,status=400)=>{throw new HttpError(status,message);};
export function stripeTaxConfig(env=process.env){
 return {enabled:env.VERCEL_ENV!=='production'&&stripeTestConfiguration(env).configured&&env.TP_STRIPE_TAX_SETUP_APPROVED==='true'&&env.TP_STRIPE_TEST_TAX_ENABLED==='true',
  mode:'test',requiresRegistrationReview:true,automaticCustomerExemptionEnabled:false,liveTaxCollectionEnabled:false};
}
export function taxCalculationRequest({lines,shippingCents,address,accountId}={}){
 if(!Array.isArray(lines)||lines.length<1||lines.length>20||!cents(shippingCents)||!/^acct_[A-Za-z0-9]{4,100}$/.test(accountId||''))fail('Invalid tax calculation order.');
 if(!address||address.country!=='US'||!states.has(address.state||'')||!/^\d{5}$/.test(address.postalCode||'')||typeof address.city!=='string'||address.city.length<2||address.city.length>100||typeof address.line1!=='string'||address.line1.length<4||address.line1.length>180)fail('Complete US delivery address required for tax calculation.');
 if(address.line2!==undefined&&(typeof address.line2!=='string'||address.line2.length>100||/[\x00-\x1f\x7f]/.test(address.line2)))fail('Invalid delivery address line 2.');
 const seen=new Set(),items=lines.map(line=>{
  if(!line||!/^\d{1,12}$/.test(line.sku||'')||seen.has(line.sku)||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>9999||!cents(line.unitPriceCents)||line.unitPriceCents<1||!/^txcd_\d{8}$/.test(line.approvedTaxCode||''))fail('Tax classification and exact supplier quote must be approved for every item.');
  seen.add(line.sku);const amount=line.unitPriceCents*line.quantity;if(!cents(amount))fail('Tax line is outside allowed limits.');
  return {amount,reference:line.sku,tax_code:line.approvedTaxCode,tax_behavior:'exclusive'};
 });
 const subtotal=items.reduce((s,x)=>s+x.amount,0);if(!cents(subtotal+shippingCents))fail('Tax subtotal is too large.');
 return {request:{currency:'usd',line_items:items,shipping_cost:{amount:shippingCents},
  customer_details:{address:{line1:address.line1,...(address.line2?{line2:address.line2}:{}),city:address.city,state:address.state,postal_code:address.postalCode,country:'US'},address_source:'shipping'}},
  subtotalCents:subtotal,shippingCents,addressDigest:digest([address.line1,address.line2||'',address.city,address.state,address.postalCode,address.country])};
}
export function validateTaxCalculation(calculation,plan,{now=Date.now()}={}){
 if(!/^taxcalc_[A-Za-z0-9]{4,160}$/.test(calculation?.id||'')||calculation.object!=='tax.calculation'||calculation.currency!=='usd'||!cents(calculation.tax_amount_exclusive)||calculation.tax_amount_inclusive!==0||!cents(calculation.amount_total)||calculation.amount_total!==plan.subtotalCents+plan.shippingCents+calculation.tax_amount_exclusive)fail('Stripe Tax returned an incomplete or mismatched calculation.',503);
 const expires=Number.isFinite(calculation.expires_at)?calculation.expires_at*1000:NaN;
 if(!Number.isFinite(expires)||expires<=now||expires>now+86400000)fail('Stripe Tax calculation is expired or lacks a verifiable expiry.',503);
 const returned=calculation.customer_details?.address,expected=plan.request.customer_details.address;if(!returned||['line1','line2','city','state','postal_code','country'].some(k=>normalized(returned[k])!==normalized(expected[k])))fail('Stripe Tax address does not match the request.',503);
 const taxEvidence=digest({taxcalculation:calculation.id,subtotal:plan.subtotalCents,shipping:plan.shippingCents,tax:calculation.tax_amount_exclusive,total:calculation.amount_total,addressDigest:plan.addressDigest});
 return {provider:'stripe-tax',mode:'test',taxStatus:'calculated',taxEvidence,taxCalculationId:calculation.id,
  taxCents:calculation.tax_amount_exclusive,totalCents:calculation.amount_total,currency:'USD',
  expiresAt:new Date(expires).toISOString(),addressDigest:plan.addressDigest,exemptionReviewed:false,
  customerTaxAddressStored:false};
}
export function createStripeTaxQuote({env=process.env,stripeClient=null,clock=()=>Date.now()}={}){
 let client=stripeClient;
 return {configuration:()=>stripeTaxConfig(env),
  async calculate(order){if(!stripeTaxConfig(env).enabled)fail('Stripe Tax registration and test calculation have not been approved.',503);
   const plan=taxCalculationRequest({...order,accountId:env.TP_STRIPE_TEST_ACCOUNT_ID});
   const c=client||(client=new Stripe(env.TP_STRIPE_TEST_SECRET_KEY,{maxNetworkRetries:0,timeout:10000}));
   let account,calculation;try{account=await c.accounts.retrieve();}catch{fail('Stripe Tax merchant account could not be verified.',503);}
   if(account?.id!==env.TP_STRIPE_TEST_ACCOUNT_ID)fail('Stripe Tax account mismatch.',503);
   try{calculation=await c.tax.calculations.create(plan.request);}catch{fail('Stripe Tax calculation could not be completed. Do not assume zero tax.',503);}
   return validateTaxCalculation(calculation,plan,{now:clock()});
  }
 };
}
