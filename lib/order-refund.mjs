// Exact-order full TEST refund only. An attempted request can only be reconciled, never resent.
import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
import {createFinalOrderStore} from './final-order-store.mjs';
import {createOrderReleaseControl} from './order-release-control.mjs';
import {createPaymentVerificationStore,paymentOrderKey,paymentRecordKey} from './payment-verification-store.mjs';
import {bindingForFinalOrder,validateBinding} from './payment-release-policy.mjs';
import {createStripePaymentVerifier,isVerifiedPayment,stripeTestConfiguration} from './stripe-payment-verifier.mjs';
import {fault,hash,fields,orderId,orderSeal,finalized,previewMerchant,createOrderExtensionStore} from './order-extension-store.mjs';
const statuses=new Set(['pending','requires_action','succeeded','failed','canceled']);
const bindingSeal=b=>hash({...b,createdAt:null});
export function createOrderRefund({env=process.env,orders=createFinalOrderStore({env}),ledger=createPaymentVerificationStore({env}),release=createOrderReleaseControl({env,orders}),store=createOrderExtensionStore({area:'order-refund',env}),client=null,clock=()=>Date.now()}={}){
 const environment=Object.freeze({...env});let sdk=client;
 const provider=()=>sdk||(sdk=new Stripe(environment.TP_STRIPE_TEST_SECRET_KEY,{maxNetworkRetries:0,timeout:10000}));
 function guard(){previewMerchant(environment);if(!stripeTestConfiguration(environment).configured)fault('Private test refund reads require the configured Stripe test account.',503);}
 function enabled(id){return environment.VERCEL_ENV==='preview'&&environment.TP_STRIPE_TEST_REFUND_ENABLED==='true'&&environment.TP_STRIPE_TEST_REFUND_APPROVED==='true'&&environment.TP_STRIPE_TEST_REFUND_ORDER_ID===id&&stripeTestConfiguration(environment).configured;}
 const view=(id,r)=>({mode:'test',orderId:id,revision:r?.revision||0,state:r?.state||'not-requested',attempted:r?.attempted===true,amountCents:r?.binding?.amountCents??null,checkedAt:r?.checkedAt||null,refundConfirmed:r?.state==='succeeded',bankCreditVerified:false,automaticRetryAllowed:false,liveRefundEnabled:false,writeEnabled:enabled(id),emailSent:false});
 async function load(id){guard();const order=await finalized(orders,id),row=await store.read(id);if(row&&(row.record.seal!==orderSeal(order)||row.record.orderId!==id||row.record.kind!=='order-refund'||row.record.mode!=='test'||row.record.attempted!==true||!Number.isSafeInteger(row.record.revision)||row.record.revision<1||row.record.revision>=Number.MAX_SAFE_INTEGER-2||!['uncertain',...statuses].includes(row.record.state)||!Number.isFinite(Date.parse(row.record.attemptedAt))))fault('Saved refund differs from this exact test order.',409);return {order,row};}
 async function linked(order){const link=await ledger.read(paymentOrderKey(environment.TP_STRIPE_TEST_ACCOUNT_ID,order.id));if(!link)fault('No saved payment is linked to this order. Reconcile the existing payment first.',409);const b=validateBinding(link.record.binding);const paid=await ledger.read(paymentRecordKey(b.accountId,b.paymentId));if(b.accountId!==environment.TP_STRIPE_TEST_ACCOUNT_ID||b.orderId!==order.id||!paid||bindingSeal(validateBinding(paid.record.binding))!==bindingSeal(b))fault('The original order/payment linkage cannot be verified.',409);
  const expected=bindingForFinalOrder(order.order,{paymentId:b.paymentId,accountId:b.accountId,now:Date.parse(b.createdAt)});if(bindingSeal(expected)!==bindingSeal(b))fault('The linked payment is not for this immutable order total.',409);return b;}
 async function stopped(id){const s=await release.read(id);if(s.releaseStopped!==true||s.supplierAttempted!==false)fault('Stop supplier release before a refund. Previously submitted orders require separate cancellation review.',409);}
 async function persist(id,next,etag){try{await store.save(id,next,etag);}catch{const saved=await store.read(id);if(saved?.record.operation!==next.operation)fault('Refund persistence changed or is uncertain. Reload; do not request another refund.',409);}const saved=await store.read(id);if(saved?.record.operation!==next.operation)fault('Refund persistence could not be read back.',503);return saved;}
 async function canonical(b){const c=provider(),a=await c.accounts.retrieve(),pi=await c.paymentIntents.retrieve(b.paymentId,{expand:['latest_charge']});if(a?.id!==b.accountId||pi?.object!=='payment_intent'||pi.id!==b.paymentId||pi.livemode!==false||pi.currency!=='usd'||pi.amount!==b.amountCents||pi.amount_received!==b.amountCents||pi.status!=='succeeded'||pi.metadata?.tp_order_id!==b.orderId||pi.metadata?.tp_order_version!==String(b.orderVersion)||pi.metadata?.tp_quote_digest!==b.quoteDigest)fault('Current Stripe test payment does not match the saved order.',409);
  const ch=pi.latest_charge;if(ch?.object!=='charge'||!/^ch_[A-Za-z0-9]{4,150}$/.test(ch.id||'')||ch.livemode!==false||ch.payment_intent!==b.paymentId||ch.amount!==b.amountCents||ch.amount_captured!==b.amountCents||ch.currency!=='usd'||ch.paid!==true||ch.captured!==true)fault('Captured test charge could not be verified.',409);return ch;}
 async function observe(order,row){const r=row.record,b=await linked(order);if(bindingSeal(b)!==bindingSeal(r.binding))fault('Refund payment binding changed.',409);await stopped(order.id);let state='uncertain',refundId=null;
  try{const ch=await canonical(b);if(ch.id!==r.chargeId)throw Error('charge-changed');const list=await provider().refunds.list({payment_intent:b.paymentId,limit:2});if(list?.object!=='list'||list.has_more!==false||!Array.isArray(list.data)||list.data.length!==1)throw Error('not-exactly-one-refund');const item=list.data[0];if(!/^re_[A-Za-z0-9]{4,150}$/.test(item?.id||''))throw Error('refund-id');const refund=await provider().refunds.retrieve(item.id);
   // Refunds do not carry a documented livemode field. Mode is established by key/account/payment/charge.
   if(refund?.object!=='refund'||refund.id!==item.id||refund.payment_intent!==b.paymentId||refund.charge!==r.chargeId||refund.amount!==b.amountCents||refund.currency!=='usd'||refund.metadata?.tp_order_id!==order.id||refund.metadata?.tp_refund_request!==r.requestId||!statuses.has(refund.status)||!Number.isSafeInteger(refund.created)||refund.created*1000<Date.parse(r.attemptedAt)-30000||refund.created*1000>clock()+30000)throw Error('refund-mismatch');
   if(refund.status==='succeeded'&&(ch.amount_refunded!==b.amountCents||ch.refunded!==true))throw Error('refund-total-unverified');state=refund.status;refundId=refund.id;
  }catch{/* Failed or incomplete reads are uncertainty, never permission to resend. */}
  const latest=await store.read(order.id);if(latest?.record.operation!==r.operation)fault('Refund status changed during verification. Reload.',409);
  if(['succeeded','failed','canceled'].includes(r.state)&&state!==r.state&&state!=='uncertain')state='uncertain';
  return view(order.id,(await persist(order.id,{...r,state,refundId:refundId||r.refundId||null,checkedAt:new Date(clock()).toISOString(),revision:r.revision+1,operation:randomUUID()},latest.etag)).record);
 }
 return {
  async read(id){const {row}=await load(id);return view(id,row?.record);},
  async submit(input){fields(input,['orderId','expectedRevision','requestId','consent']);orderId(input.orderId);orderId(input.requestId);if(input.consent!==true||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER-3)fault('Confirm the exact full test refund.');guard();if(!enabled(input.orderId))fault('A full test refund for this exact order has not been approved and enabled.',503);
   const {order,row}=await load(input.orderId),digest=hash([input.orderId,input.expectedRevision]);if(row){if(row.record.requestId===input.requestId&&row.record.requestDigest===digest)return view(order.id,row.record);fault('A refund attempt already exists. Reconcile it; never submit another refund from this workspace.',409);}if(input.expectedRevision!==0)fault('Reload the saved refund state.',409);
   await stopped(order.id);const b=await linked(order),proof=await createStripePaymentVerifier({env:environment,client:provider(),clock}).verify(b);if(!isVerifiedPayment(proof)||!proof.captured||!proof.eligible||proof.paymentId!==b.paymentId)fault('An exact, captured test payment with no prior refund/dispute is required.',409);await stopped(order.id);
   const claim={schemaVersion:1,kind:'order-refund',mode:'test',orderId:order.id,seal:orderSeal(order),revision:1,operation:randomUUID(),requestId:input.requestId,requestDigest:digest,binding:b,chargeId:proof.chargeId,state:'uncertain',attempted:true,attemptedAt:new Date(clock()).toISOString(),checkedAt:null,refundId:null};
   const saved=await persist(order.id,claim,null);
   try{await stopped(order.id);const latest=await finalized(orders,order.id);if(orderSeal(latest)!==claim.seal)throw Error('changed');const current=await store.read(order.id);if(current?.record.operation!==claim.operation)throw Error('superseded');
    await provider().refunds.create({payment_intent:b.paymentId,amount:b.amountCents,metadata:{tp_order_id:order.id,tp_refund_request:input.requestId}},{idempotencyKey:'tp-full-test-refund-'+hash([b.accountId,order.id,input.requestId])});
   }catch{/* One durable intent; regardless of reply, only authenticated reads follow. */}
   return observe(order,saved);
  },
  async reconcile(input){fields(input,['orderId','consent']);orderId(input.orderId);if(input.consent!==true)fault('Confirm checking only this existing test refund.');const {order,row}=await load(input.orderId);if(!row)fault('No saved refund attempt exists.',409);return observe(order,row);}
 };
}
