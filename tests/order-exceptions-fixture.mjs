import {randomUUID} from 'node:crypto';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {createOrderRefund} from '../lib/order-refund.mjs';
import {memoryOrderExtensionStore} from '../lib/order-extension-store.mjs';
export async function exceptionFixture({paid=true,store=memoryOrderExtensionStore(),releaseStore=memoryOrderExtensionStore(),cartPatch={},envPatch={}}={}){
 const t=await cartPaymentFixture({releaseStore,refundStore:store,patch:cartPatch}),order=await t.finalize();if(paid){await t.service.open(t.owner,{orderId:order.id,testConsent:true});t.paid();await t.service.reconcile(t.owner,{orderId:order.id});}
 const env={...t.env,TP_STRIPE_TEST_REFUND_ENABLED:'true',TP_STRIPE_TEST_REFUND_APPROVED:'true',TP_STRIPE_TEST_REFUND_ORDER_ID:order.id,...envPatch};
 let result=null,state='succeeded',failure='',listFailure=false,patch=x=>x;const calls={create:0,list:0,retrieve:0},requests=[];
 t.client.refunds={async create(input,options){calls.create++;requests.push({input:structuredClone(input),options});if(failure==='before')throw Error('synthetic lost before');const pi=await t.client.paymentIntents.retrieve(t.pid);result={id:'re_SYNTHETICFULL123',object:'refund',amount:input.amount,currency:'usd',payment_intent:input.payment_intent,charge:pi.latest_charge.id,metadata:input.metadata,status:state,created:Math.floor(t.now()/1000)};if(state==='succeeded')t.refund();if(failure==='after')throw Error('synthetic lost after');return structuredClone(result);},async list(q){calls.list++;if(listFailure)throw Error('synthetic read unavailable');if(q.payment_intent!==t.pid||q.limit!==2)throw Error('unexpected selector');return {object:'list',has_more:false,data:result?[patch(structuredClone(result))]:[]};},async retrieve(id){calls.retrieve++;if(!result||id!==result.id)throw Error('unknown refund');return patch(structuredClone(result));}};
 const refund=createOrderRefund({env,orders:t.store,ledger:t.paymentStore,release:t.release,store,client:t.client,clock:t.now});
 const stop=async()=>t.release.stop({orderId:order.id,expectedRevision:(await t.release.read(order.id)).revision,requestId:randomUUID(),reason:'merchant-review',consent:true});
 return {t,env,order,store,refund,release:t.release,calls,requests,stop,input:()=>({orderId:order.id,expectedRevision:0,requestId:randomUUID(),consent:true}),setState:v=>{state=v;if(result)result.status=v;if(result&&v==='succeeded')t.refund();},setFailure:v=>{failure=v;},setListFailure:v=>{listFailure=v;},setPatch:v=>{patch=v;}};
}
