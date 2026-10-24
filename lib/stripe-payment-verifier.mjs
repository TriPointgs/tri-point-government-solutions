// Optional, disabled-by-default Stripe TEST-only read adapter. It cannot create, capture or refund payments.
import Stripe from 'stripe';
import {HttpError} from './model.mjs';
const proofs=new WeakSet(),events=new WeakSet();
export const isVerifiedPayment=value=>!!value&&proofs.has(value);
export const isVerifiedPaymentEvent=value=>!!value&&events.has(value);
const fail=(message,status=502)=>{throw new HttpError(status,message);};
const freeze=x=>{if(x&&typeof x==='object'){for(const child of Object.values(x))freeze(child);Object.freeze(x);}return x;};
const objectId=(x,pattern)=>typeof x==='string'&&pattern.test(x);
const piPattern=/^pi_[A-Za-z0-9]{4,150}$/,chPattern=/^ch_[A-Za-z0-9]{4,150}$/;
const recognized=new Set(['payment_intent.succeeded','payment_intent.processing','payment_intent.payment_failed','payment_intent.canceled','payment_intent.amount_capturable_updated','charge.refunded','charge.dispute.created','charge.dispute.closed','refund.created','refund.updated','refund.failed']);
export function stripeTestConfiguration(env=process.env){return {provider:'stripe',mode:'test',configured:env.VERCEL_ENV!=='production'&&env.TP_STRIPE_TEST_READS_ENABLED==='true'&&/^(sk|rk)_test_[A-Za-z0-9]{8,}$/.test(env.TP_STRIPE_TEST_SECRET_KEY||'')&&/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||'')&&/^whsec_[A-Za-z0-9]{8,}$/.test(env.TP_STRIPE_TEST_WEBHOOK_SECRET||''),captureSupported:false,refundSupported:false,checkoutCreationSupported:false,livePaymentsEnabled:false,supplierSubmissionEnabled:false};}
export function createStripePaymentVerifier({env=process.env,client=null,clock=()=>Date.now()}={}){
 env=Object.freeze(Object.fromEntries(['VERCEL_ENV','TP_STRIPE_TEST_READS_ENABLED','TP_STRIPE_TEST_SECRET_KEY','TP_STRIPE_TEST_ACCOUNT_ID','TP_STRIPE_TEST_WEBHOOK_SECRET'].map(k=>[k,env[k]])));
 let sdk=client;
 const guard=()=>{if(!stripeTestConfiguration(env).configured)fail('Test payment verification is not configured. Live payments and supplier ordering remain disabled.',503);if(!sdk)sdk=new Stripe(env.TP_STRIPE_TEST_SECRET_KEY,{maxNetworkRetries:0,timeout:10000});return sdk;};
 function parseEvent(raw,signature){guard();if(!Buffer.isBuffer(raw)||raw.length>262144||typeof signature!=='string'||signature.length>4096)fail('Invalid payment event.',400);
  const stamps=signature.split(',').filter(x=>x.trim().startsWith('t=')).map(x=>x.trim().slice(2));if(stamps.length!==1||!/^\d{10,13}$/.test(stamps[0])||Number(stamps[0])>Math.floor(clock()/1000)+30||Number(stamps[0])<Math.floor(clock()/1000)-300)fail('Invalid payment-event timestamp.',400);
  let event;try{event=Stripe.webhooks.constructEvent(raw,signature,env.TP_STRIPE_TEST_WEBHOOK_SECRET,300,undefined,clock());}catch{fail('Payment event signature was not verified.',400);}
  if(event.livemode!==false||event.account!=null||event.context!=null||!/^evt_[A-Za-z0-9]{4,150}$/.test(event.id||''))fail('Payment event account or mode is not permitted.',400);
  if(!recognized.has(event.type))return null;
  const obj=event.data?.object;if(!obj||typeof obj!=='object')fail('Invalid payment event object.',400);
  let paymentId=null,chargeId=null;
  if(event.type.startsWith('payment_intent.')){if(obj.object!=='payment_intent'||!objectId(obj.id,piPattern))fail('Invalid payment identifier.',400);paymentId=obj.id;}
  else {if(!['charge','dispute','refund'].includes(obj.object))fail('Invalid payment event object.',400);if(objectId(obj.payment_intent,piPattern))paymentId=obj.payment_intent;else if(objectId(obj.object==='charge'?obj.id:obj.charge,chPattern))chargeId=obj.object==='charge'?obj.id:obj.charge;else fail('Event cannot be linked to a payment.',400);}
  const demoId=obj.metadata?.tp_flow==='tp-sandbox-checkout-demo-v1'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(obj.metadata?.tp_order_id||'')?obj.metadata.tp_order_id:null;const safe=freeze({id:event.id,type:event.type,mode:'test',paymentId,chargeId,riskHold:!event.type.startsWith('payment_intent.'),created:event.created,...(demoId?{sandboxDemoId:demoId}:{})});events.add(safe);return safe;
 }
 async function readAccount(){const c=guard();let account;try{account=await c.accounts.retrieve();}catch{fail('Payment account verification failed. No supplier order is permitted.');}if(account?.id!==env.TP_STRIPE_TEST_ACCOUNT_ID)fail('The payment credential belongs to an unexpected merchant account.');return account.id;}
 return {configuration:()=>stripeTestConfiguration(env),parseEvent,
  async eventPaymentId(event){if(!isVerifiedPaymentEvent(event))fail('A verified payment event is required.',400);if(event.paymentId)return event.paymentId;await readAccount();let charge;try{charge=await guard().charges.retrieve(event.chargeId);}catch{fail('Payment event linkage could not be checked.');}if(charge?.id!==event.chargeId||charge.livemode!==false||!objectId(charge.payment_intent,piPattern))fail('Payment event linkage did not match.');return charge.payment_intent;},
  async verify(binding){const c=guard();if(binding.mode!=='test'||binding.provider!=='stripe'||binding.accountId!==env.TP_STRIPE_TEST_ACCOUNT_ID||!objectId(binding.paymentId,piPattern))fail('Payment binding is outside this test merchant account.',400);
   const accountId=await readAccount();let pi;try{pi=await c.paymentIntents.retrieve(binding.paymentId,{expand:['latest_charge','latest_charge.refunds']});}catch{fail('Current payment state could not be verified. No supplier order is permitted.');}
   if(pi?.id!==binding.paymentId||pi.object!=='payment_intent'||pi.livemode!==false)fail('The returned payment identity or mode does not match.');
   const reasons=[],metadata=pi.metadata||{},charge=pi.latest_charge;
   if(metadata.tp_order_id!==binding.orderId||metadata.tp_order_version!==String(binding.orderVersion)||metadata.tp_quote_digest!==binding.quoteDigest)reasons.push('order_metadata_mismatch');
   if(pi.amount!==binding.amountCents||pi.currency!=='usd')reasons.push('amount_or_currency_mismatch');
   if(pi.status!=='succeeded')reasons.push(pi.status==='requires_capture'?'authorized_not_captured':'payment_not_succeeded');
   if(pi.amount_received!==binding.amountCents||pi.amount_capturable!==0)reasons.push('full_capture_not_confirmed');
   if(pi.review!=null||pi.on_behalf_of!=null||pi.transfer_data!=null)reasons.push('review_or_account_routing_hold');
   if(!charge||typeof charge!=='object'||charge.object!=='charge'||!objectId(charge.id,chPattern)||charge.payment_intent!==binding.paymentId||charge.livemode!==false)reasons.push('charge_not_verified');
   else {
    if(charge.status!=='succeeded'||charge.paid!==true||charge.captured!==true)reasons.push('charge_not_captured');
    if(charge.amount!==binding.amountCents||charge.amount_captured!==binding.amountCents||charge.currency!=='usd')reasons.push('charge_amount_mismatch');
    if(charge.refunded!==false||charge.amount_refunded!==0||charge.disputed!==false)reasons.push('refund_or_dispute_hold');
    if(charge.review!=null||charge.on_behalf_of!=null||charge.transfer_data!=null||charge.fraud_details?.user_report==='fraudulent')reasons.push('charge_risk_hold');
    if(!charge.refunds||!Array.isArray(charge.refunds.data)||charge.refunds.data.length||charge.refunds.has_more!==false)reasons.push('refund_history_not_clear');
    if(charge.payment_method_details?.type!=='card')reasons.push('payment_method_not_validated');
   }
   const result=freeze({provider:'stripe',mode:'test',accountId,paymentId:pi.id,chargeId:typeof charge==='object'&&objectId(charge?.id,chPattern)?charge.id:null,orderId:binding.orderId,orderVersion:binding.orderVersion,quoteDigest:binding.quoteDigest,amountCents:binding.amountCents,currency:'USD',captured:reasons.length===0,eligible:reasons.length===0,reasons:[...new Set(reasons)],checkedAt:new Date(clock()).toISOString(),source:'authenticated-payment-intent-and-charge-read',bankPayoutVerified:false});proofs.add(result);return result;
  }
 };
}
