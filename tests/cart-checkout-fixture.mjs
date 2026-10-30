import {createOrderReleaseControl} from '../lib/order-release-control.mjs';
import {memoryOrderExtensionStore} from '../lib/order-extension-store.mjs';
import {createHash} from 'node:crypto';
import {finalizationFixture} from './cart-finalization-fixture.mjs';
import {NOW} from './checkout-safety-fixture.mjs';
import {createCartCheckoutService} from '../lib/cart-checkout-service.mjs';
import {createStripePaymentVerifier} from '../lib/stripe-payment-verifier.mjs';
import {memoryCheckoutSessionStore} from '../lib/stripe-checkout-session.mjs';
import {memoryPaymentVerificationStore} from '../lib/payment-verification-store.mjs';
import {memoryCartOrderHistoryStore} from '../lib/cart-order-history.mjs';
import {processorIntent,eventBytes} from './payment-first-fixture.mjs';
export async function cartPaymentFixture({patch={},paymentStore=memoryPaymentVerificationStore(),checkoutStore=memoryCheckoutSessionStore(),orderStore,releaseStore=memoryOrderExtensionStore(),history=memoryCartOrderHistoryStore()}={}){
 let now=NOW;const base=await finalizationFixture({clock:()=>now,...(orderStore?{store:orderStore}:{})}),env={...base.env,TP_CART_CHECKOUT_PREVIEW_ENABLED:'true',TP_STRIPE_TEST_CHECKOUT_ENABLED:'true',VERCEL_BRANCH_URL:'synthetic.vercel.app',...patch};
 const terms='SYNTHETIC TEST TERMS ONLY. Not approved business terms. No goods or services are purchased.';
 base.policy().terms.text=terms;base.policy().terms.contentDigest=createHash('sha256').update(terms).digest('hex');
 let paid=false,refund=false,intentError=false,sessionPatch={},intentPatch={},createError=false,session=null,options=null;const counts={create:0,session:0,intent:0},requests=[];
 const pid='pi_CARTSYNTHETIC123456',sid='cs_test_CARTSYNTHETIC123456';
 const client={accounts:{retrieve:async()=>({id:env.TP_STRIPE_TEST_ACCOUNT_ID})},checkout:{sessions:{
  async create(params,opts){counts.create++;options=opts;requests.push(structuredClone(params));if(createError)throw Error('synthetic uncertain creation');if(!session)session={object:'checkout.session',id:sid,url:'https://checkout.stripe.com/c/pay/synthetic',livemode:false,mode:'payment',created:Math.floor(now/1000),client_reference_id:params.client_reference_id,payment_status:'unpaid',status:'open',currency:'usd',amount_total:params.line_items.reduce((n,l)=>n+l.price_data.unit_amount*l.quantity,0),metadata:params.metadata,payment_intent:null,payment_method_types:['card']};return structuredClone(session);},
  async list({payment_intent,limit}){if(payment_intent!==pid||limit!==2)throw Error('synthetic invalid list');return {object:'list',has_more:false,data:session?[await this.retrieve(sid)]:[]};},
  async retrieve(id){counts.session++;if(!session||id!==sid)throw Error('synthetic missing session');return {...structuredClone(session),payment_intent:paid?pid:null,payment_status:paid?'paid':'unpaid',status:paid?'complete':'open',...sessionPatch};}
 }},paymentIntents:{async retrieve(id){counts.intent++;if(intentError)throw Error('synthetic read failed');if(!session||id!==pid)throw Error('synthetic unknown payment');const b={paymentId:pid,orderId:session.client_reference_id,orderVersion:1,quoteDigest:session.metadata.tp_quote_digest,amountCents:session.amount_total};const p=processorIntent(b);p.metadata.tp_flow=session.metadata.tp_flow;if(!paid){p.status='requires_payment_method';p.amount_received=0;p.latest_charge.paid=false;p.latest_charge.captured=false;}if(refund){p.latest_charge.refunded=true;p.latest_charge.amount_refunded=p.amount;p.latest_charge.refunds.data=[{id:'re_SYNTHETIC'}];}return {...p,...intentPatch};}},charges:{retrieve:async()=>({id:'ch_SYNTHETIC123456',livemode:false,payment_intent:pid})}};
 const release=createOrderReleaseControl({env,orders:base.store,store:releaseStore,clock:()=>now});
 const verifier=createStripePaymentVerifier({env,client,clock:()=>now}),service=createCartCheckoutService({env,shop:base.service,orders:base.store,policies:base.policies,tax:base.tax,client,verifier,paymentStore,checkoutStore,history,release,clock:()=>now});
 const request={...base.request,termsDigest:base.policy().terms.contentDigest,testConsent:true};
 return {...base,env,service,verifier,release,releaseStore,paymentStore,checkoutStore,history,counts,requests,pid,request,client,
  now:()=>now,advance:n=>{now+=n;},paid:()=>{paid=true;},refund:()=>{refund=true;},setIntentError:v=>{intentError=v;},setSessionPatch:v=>{sessionPatch=v;},setIntentPatch:v=>{intentPatch=v;},setCreateError:v=>{createError=v;},createOptions:()=>options,
  finalize:()=>service.finalize(base.owner,request),
  sessionEvent:async(type='checkout.session.completed')=>eventBytes({type,at:now,object:await client.checkout.sessions.retrieve(sid)}),
  event:(type='payment_intent.succeeded')=>eventBytes({type,payment:pid,at:now,object:type.startsWith('payment_intent.')?{object:'payment_intent',id:pid}:{object:'charge',id:'ch_SYNTHETIC123456',payment_intent:pid}})
 };
}
