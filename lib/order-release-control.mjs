// A permanent pre-submission stop uses the SAME conditional record as supplier dispatch.
// It is not a supplier cancellation, Stripe Session expiry, refund or customer notice.
import {randomUUID} from 'node:crypto';
import {createFinalOrderStore} from './final-order-store.mjs';
import {procurementSeal,uatScope} from './td-po-contract.mjs';
import {fault,hash,fields,orderId,finalized,previewMerchant,createOrderExtensionStore} from './order-extension-store.mjs';
export function createOrderReleaseControl({env=process.env,orders=createFinalOrderStore({env}),store=createOrderExtensionStore({area:'supplier-dispatch',env}),clock=()=>Date.now()}={}){
 async function load(id){previewMerchant(env);const order=await finalized(orders,id),row=await store.read(id);if(row&&(row.record.seal!==procurementSeal(order)||row.record.kind!=='supplier-dispatch'||row.record.orderId!==id||row.record.mode!=='test'))fault('Release control differs from this saved order.',409);return {order,row};}
 const view=(id,r)=>({mode:'test',orderId:id,revision:r?.revision||0,releaseStopped:r?.releaseStopped===true,stopReason:r?.releaseStopped?r.stopReason:null,stoppedAt:r?.stoppedAt||null,supplierAttempted:r?.attempted===true,supplierCanceled:false,refundRequested:false,checkoutExpired:false});
 return {
  async read(id){const {row}=await load(id);return view(id,row?.record);},
  async assertOpen(id){const r=await this.read(id);if(r.releaseStopped)fault('This test order is stopped. Verify any existing payment; do not open another checkout.',409);return r;},
  async stop(input){fields(input,['orderId','expectedRevision','requestId','reason','consent']);orderId(input.orderId);orderId(input.requestId);if(input.consent!==true||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER-3||!['cancellation-request','supplier-unavailable','merchant-review'].includes(input.reason))fault('Confirm the exact saved order and stop reason.');
   const {order,row}=await load(input.orderId),old=row?.record,digest=hash([input.orderId,input.expectedRevision,input.reason]);
   if(old?.stopRequestId===input.requestId){if(old.stopRequestDigest!==digest)fault('Stop request identity was reused.',409);return view(order.id,old);}
   if(old?.releaseStopped)return view(order.id,old);
   if((old?.revision||0)!==input.expectedRevision)fault('Supplier state changed. Reload before stopping.',409);
   if(old?.attempted===true)fault('A supplier submission was already claimed. Reconcile it; website stop cannot confirm supplier cancellation.',409);
   const next={...(old||{}),schemaVersion:1,kind:'supplier-dispatch',mode:'test',orderId:order.id,seal:procurementSeal(order),scope:old?.scope||uatScope(env),revision:input.expectedRevision+1,operation:randomUUID(),state:'release-stopped',releaseStopped:true,stopReason:input.reason,stoppedAt:new Date(clock()).toISOString(),stopRequestId:input.requestId,stopRequestDigest:digest,attempted:false,activeRequest:null,completedRequest:null,result:null,reason:'merchant-release-stop'};
   try{await store.save(order.id,next,row?.etag||null);}catch{const seen=await store.read(order.id);if(seen?.record.operation!==next.operation)fault('The stop conflicted or could not be verified. Reload the same order.',409);}
   const seen=await load(order.id);if(seen.row?.record.operation!==next.operation||seen.row.record.releaseStopped!==true)fault('Stop persistence could not be confirmed.',503);return view(order.id,seen.row.record);
  }
 };
}
