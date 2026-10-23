// Preview-only Stripe Checkout bridge for a server-finalized order.
// This module has no HTTP route, cannot finalize cart reviews, and never sends a TD purchase order.
import Stripe from 'stripe';
import {createHash} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {bindingForFinalOrder} from './payment-release-policy.mjs';
import {stripeTestConfiguration} from './stripe-payment-verifier.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
const stripeSession=x=>typeof x==='string'&&/^cs_test_[A-Za-z0-9]{6,255}$/.test(x);
const safeName=x=>String(x||'').replace(/[\x00-\x1f<>]/g,' ').trim().slice(0,140);
const fail=(message,status=400)=>{throw new HttpError(status,message);};
function guard(env){
 if(env.VERCEL_ENV==='production'||env.TP_STRIPE_TEST_CHECKOUT_ENABLED!=='true'||!stripeTestConfiguration(env).configured)
   fail('Stripe sandbox Checkout is disabled. No customer payment or TD order is available.',503);
}
export function checkoutSessionKey(accountId,orderId){
 if(!/^acct_[A-Za-z0-9]{4,100}$/.test(accountId||'')||!uuid(orderId))fail('Invalid test checkout reference.');
 return sha(JSON.stringify(['stripe-test-checkout-v1',accountId,orderId]));
}
export function checkoutSessionPlan(order,{accountId,origin,now=Date.now()}={}){
 if(!/^acct_[A-Za-z0-9]{4,100}$/.test(accountId||'')||!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(origin||''))
   fail('A preview-only Stripe account and origin are required.');
 // The placeholder only validates and computes the exact authoritative quote digest.
 // It is not saved as a payment binding; the actual PaymentIntent is created by Stripe later.
 const binding=bindingForFinalOrder(order,{paymentId:'pi_CHECKOUTPENDING',accountId,now});
 if(Date.parse(order.quoteExpiresAt)-now<300000)fail('Supplier quote is too close to expiry. Recheck the order.',409);
 const lines=order.lines.map(line=>({
  price_data:{currency:'usd',unit_amount:line.unitPriceCents,product_data:{name:safeName(line.description||line.manufacturerPart||'Approved merchandise'),metadata:{tp_sku:line.sku,tp_manufacturer_part:line.manufacturerPart}}},
  quantity:line.quantity
 }));
 if(order.shippingCents>0)lines.push({price_data:{currency:'usd',unit_amount:order.shippingCents,product_data:{name:'Verified shipping charge'}},quantity:1});
 if(order.taxCents>0)lines.push({price_data:{currency:'usd',unit_amount:order.taxCents,product_data:{name:'Verified transaction tax'}},quantity:1});
 if(lines.length>22||lines.reduce((sum,l)=>sum+l.price_data.unit_amount*l.quantity,0)!==binding.amountCents)fail('Checkout amount does not match the finalized order.');
 const metadata={tp_order_id:binding.orderId,tp_order_version:String(binding.orderVersion),tp_quote_digest:binding.quoteDigest};
 const params={
  mode:'payment',ui_mode:'hosted_page',allowed_payment_method_types:['card'],payment_method_collection:'always',billing_address_collection:'required',
  client_reference_id:binding.orderId,
  line_items:lines,metadata,payment_intent_data:{metadata},
  // Tax must be authoritatively finalized by the business BEFORE creating this session.
  // Do not silently replace unknown tax with zero or enable Stripe dynamic tax after fixing the payable total.
  automatic_tax:{enabled:false},
  success_url:origin+'/shop-preview?payment_status=check&session_id={CHECKOUT_SESSION_ID}',
  cancel_url:origin+'/shop-preview?payment_status=cancel',
  customer_creation:'if_required'
 };
 const idempotencyKey='tp-sandbox-checkout-'+sha(JSON.stringify([accountId,binding.orderId,binding.orderVersion,binding.quoteDigest]));
 return {params,idempotencyKey,binding,amountCents:binding.amountCents,quoteExpiresAt:binding.expiresAt};
}
export function createCheckoutSessionStore({env=process.env,blob={get,put}}={}){
 const location=key=>{if(!/^[a-f0-9]{64}$/.test(key))fail('Invalid checkout store key.');return 'preview/stripe-checkout-sessions/v1/'+key+'.json';};
 return {
  async read(key){if(env.VERCEL_ENV==='production')fail('Live Checkout storage disabled.',503);
   let r;try{r=await blob.get(location(key),{access:'private',useCache:false});}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}
   if(!r)return null;
   if(!r.blob?.etag)fail('Checkout storage could not confirm its version.',503);
   const raw=await new Response(r.stream).text();if(Buffer.byteLength(raw)>30000)fail('Invalid checkout storage.',503);
   const record=JSON.parse(raw);if(record.schemaVersion!==1||record.mode!=='test'||record.key!==key||!['creating','open'].includes(record.state))fail('Invalid checkout storage.',503);
   return {record,etag:r.blob.etag};
  },
  async save(key,record,etag){if(env.VERCEL_ENV==='production')fail('Live Checkout storage disabled.',503);
   if(record.key!==key||record.mode!=='test'||record.schemaVersion!==1||!['creating','open'].includes(record.state))fail('Invalid checkout record.');
   const data=JSON.stringify(record);if(Buffer.byteLength(data)>30000)fail('Invalid checkout record.');
   await blob.put(location(key),data,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});
  }
 };
}
export function memoryCheckoutSessionStore(){
 const rows=new Map();let sequence=0;
 return {
  async read(key){return rows.has(key)?structuredClone(rows.get(key)):null;},
  async save(key,record,etag){const existing=rows.get(key);if((existing?.etag||null)!==etag)throw Error('etag_conflict');rows.set(key,{record:structuredClone(record),etag:String(++sequence)});}
 };
}
const linkStatus=(record,duplicate=false)=>({
 state:record.state,duplicate,sessionId:record.state==='open'?record.sessionId:null,
 url:record.state==='open'?record.url:null,orderId:record.orderId,
 customerPaid:false,verifiedCaptured:false,supplierOrderSubmitted:false,
 mode:'test',expiresAt:record.quoteExpiresAt
});
export function createStripeCheckoutSessionBridge({env=process.env,stripeClient=null,orderStore,store=createCheckoutSessionStore({env}),clock=()=>Date.now()}={}){
 if(!orderStore||typeof orderStore.get!=='function')throw Error('A trusted, server-owned finalized-order store is required.');
 let client=stripeClient;
 const clientFor=()=>client||(client=new Stripe(env.TP_STRIPE_TEST_SECRET_KEY,{maxNetworkRetries:0,timeout:10000}));
 const origin=()=>{const raw=env.VERCEL_BRANCH_URL||env.VERCEL_URL;if(!/^[a-z0-9.-]+\.vercel\.app$/.test(raw||''))fail('A verified preview deployment origin is required.',503);return 'https://'+raw;};
 return {
  configuration(){return {enabled:env.VERCEL_ENV!=='production'&&env.TP_STRIPE_TEST_CHECKOUT_ENABLED==='true'&&stripeTestConfiguration(env).configured,mode:'test',staffIntegrationOnly:true,cartReviewsPayable:false,realTdOrderingEnabled:false,livePaymentsEnabled:false};},
  async begin(orderId){
   guard(env);if(!uuid(orderId))fail('Invalid finalized order identifier.');
   const order=await orderStore.get(orderId);
   if(!order||order.id!==orderId)fail('The finalized order could not be verified.',404);
   const plan=checkoutSessionPlan(order,{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin:origin(),now:clock()});
   const key=checkoutSessionKey(env.TP_STRIPE_TEST_ACCOUNT_ID,orderId);
   let saved=await store.read(key);
   if(saved&&saved.record.quoteDigest!==plan.binding.quoteDigest)fail('The payable order changed. Reconciliation is required.',409);
   if(saved?.record.state==='open')return linkStatus(saved.record,true);
   if(!saved){
    const record={schemaVersion:1,mode:'test',key,orderId,orderVersion:plan.binding.orderVersion,quoteDigest:plan.binding.quoteDigest,
     quoteExpiresAt:plan.quoteExpiresAt,state:'creating',startedAt:new Date(clock()).toISOString(),revision:1,idempotencyKey:plan.idempotencyKey};
    try{await store.save(key,record,null);saved=await store.read(key);if(!saved||saved.record.quoteDigest!==plan.binding.quoteDigest)fail('Checkout claim could not be read back.',503);}catch(e){saved=await store.read(key);if(!saved||saved.record.quoteDigest!==plan.binding.quoteDigest)fail('Another Checkout Session attempt needs reconciliation.',409);}
   }
   // Stripe idempotency is the recovery mechanism after an uncertain external create; the quote
   // is valid for <=15 minutes and Stripe's idempotency retention is longer than this.
   if(saved.record.state!=='creating'||saved.record.idempotencyKey!==plan.idempotencyKey)fail('Checkout state needs reconciliation.',409);
   let account;try{account=await clientFor().accounts.retrieve();}catch{fail('Stripe sandbox merchant account could not be verified.',503);}
   if(account?.id!==env.TP_STRIPE_TEST_ACCOUNT_ID)fail('Stripe sandbox key belongs to a different merchant.',503);
   let session;try{session=await clientFor().checkout.sessions.create(plan.params,{idempotencyKey:plan.idempotencyKey});}
   catch{fail('Stripe sandbox session could not be confirmed. Retry the same finalized order.',503);}
   if(session?.livemode!==false||!stripeSession(session?.id)||session.mode!=='payment'||session.client_reference_id!==orderId||
      session.payment_status!=='unpaid'||session.status!=='open'||session.currency!=='usd'||session.amount_total!==plan.amountCents||
      session.metadata?.tp_quote_digest!==plan.binding.quoteDigest||typeof session.url!=='string'||!/^https:\/\/checkout\.stripe\.com\//.test(session.url))
      fail('Stripe Checkout returned an unexpected session. Do not redirect the customer.',503);
   const record={...saved.record,state:'open',revision:2,sessionId:session.id,url:session.url};
   try{await store.save(key,record,saved.etag);}catch{
    const observed=await store.read(key);
    if(observed?.record.state==='open'&&observed.record.sessionId===session.id)return linkStatus(observed.record,true);
    fail('Checkout persistence is uncertain. Retry the same finalized order.',503);
   }
   return linkStatus(record);
  },
  async reconcilePaid(orderId,{paymentService}={}){
   guard(env);if(!uuid(orderId)||!paymentService||typeof paymentService.bindFinalOrder!=='function'||typeof paymentService.recheckBoundPayment!=='function')fail('Payment reconciliation requires server-owned order and verifier.',400);
   const key=checkoutSessionKey(env.TP_STRIPE_TEST_ACCOUNT_ID,orderId),saved=await store.read(key);
   if(saved?.record.state!=='open')fail('No saved Stripe Checkout Session matches this order.',404);
   const order=await orderStore.get(orderId);if(!order||order.id!==orderId)fail('Finalized order is unavailable.',409);
   // A successful browser redirect is not proof of payment. Read the Session directly from Stripe.
   let account,session;try{account=await clientFor().accounts.retrieve();session=await clientFor().checkout.sessions.retrieve(saved.record.sessionId,{expand:['payment_intent']});}catch{fail('Stripe payment reconciliation is temporarily unavailable.',503);}
   if(account?.id!==env.TP_STRIPE_TEST_ACCOUNT_ID||session?.livemode!==false||session?.id!==saved.record.sessionId||session.client_reference_id!==orderId||session.mode!=='payment'||session.payment_status!=='paid'||session.status!=='complete'||session.currency!=='usd'||session.amount_total!==order.totalCents||session.metadata?.tp_quote_digest!==saved.record.quoteDigest)fail('Stripe Checkout payment was not confirmed for this exact order.',409);
   const pi=session.payment_intent,paymentId=typeof pi==='string'?pi:pi?.id;
   if(!/^pi_[A-Za-z0-9]{4,150}$/.test(paymentId||''))fail('A valid captured-payment reference is required.',409);
   const binding=bindingForFinalOrder(order,{paymentId,accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,now:clock()});
   if(binding.quoteDigest!==saved.record.quoteDigest||String(binding.orderVersion)!==String(session.metadata?.tp_order_version)||session.metadata?.tp_order_id!==orderId)fail('Checkout metadata does not match the finalized order.',409);
   await paymentService.bindFinalOrder(order,paymentId);
   const result=await paymentService.recheckBoundPayment(paymentId);
   return {orderId,sessionId:saved.record.sessionId,mode:'test',verifiedCaptured:result.paymentGatePassed===true,paymentGatePassed:result.paymentGatePassed===true,customerPaid:result.paymentGatePassed===true,realSupplierDispatchAllowed:false,reasons:result.reasons||[]};
  }
 };
}
