// Durable preflight and UAT read-only reconciliation. There is deliberately NO submit adapter.
import {createFinalOrderStore} from './final-order-store.mjs';
import {createCartCheckoutService} from './cart-checkout-service.mjs';
import {createOrderFinalization} from './checkout-finalization.mjs';
import {createTdReadonly} from './tdsynnex-readonly.mjs';
import {trackingURL} from './td-order-status.mjs';
import {trackingScope} from './order-tracking-service.mjs';
import {fault,hash,orderId,fields,previewMerchant,finalized,orderSeal,createOrderExtensionStore} from './order-extension-store.mjs';
const fresh=(at,now,max)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now+30000&&now-Date.parse(at)<max;
export const supplierReference=(env,id)=>'TPTEST-'+hash([previewMerchant(env),trackingScope(env),orderId(id)]).slice(0,26).toUpperCase();
export function matchSupplierObservation(order,reference,observation,{now=Date.now(),startedAt=now}={}){
 if(observation?.source!=='tdsynnex-order-status'||observation.environment!=='uat'||observation.identityMatched!==true||observation.selector?.referenceType!=='PO'||observation.selector.reference!==reference||!fresh(observation.checkedAt,now,60000)||Date.parse(observation.checkedAt)<startedAt-30000||!Array.isArray(observation.orders)||!observation.orders.length||observation.orders.length>100)fault('Supplier observation is not bound to this exact UAT check.',502);
 if(!Array.isArray(order.lines)||!order.lines.length||order.lines.length>20||new Set(order.lines.map(x=>x.sku)).size!==order.lines.length)fault('Finalized order lines cannot be reconciled.',502);
 const expected=new Map(order.lines.map(x=>[x.sku,x])),seen=new Set(),sales=new Set(),issues=new Set(),tracking=new Map();let backordered=false;
 for(const so of observation.orders){
  if(so.purchaseOrder!==reference||typeof so.salesOrder!=='string'||!so.salesOrder||sales.has(so.salesOrder)||!Array.isArray(so.lines)||so.lines.length>500)fault('Supplier response has conflicting order identities.',502);sales.add(so.salesOrder);
  for(const line of so.lines){const want=expected.get(line.partNumber);if(!want||line.manufacturerPart!==want.manufacturerPart){issues.add('product-identity-mismatch');continue;}
   if(seen.has(want.sku)){issues.add('duplicate-product-needs-manual-reconciliation');continue;}seen.add(want.sku);
   if(line.reportedOrderedQuantity!==want.quantity)issues.add('ordered-quantity-mismatch');
   if(!Array.isArray(line.subLines)||line.subLines.length>100)fault('Supplier sublines cannot be verified.',502);
   for(const sub of line.subLines){if(sub.partNumber!==want.sku||sub.manufacturerPart!==want.manufacturerPart||!Array.isArray(sub.issues)||sub.issues.length){issues.add('shipment-product-needs-review');continue;}
    if(sub.backordered===true)backordered=true;
    if(!Array.isArray(sub.tracking)||sub.tracking.length>100)fault('Supplier tracking cannot be verified.',502);
    for(const item of sub.tracking){const url=trackingURL(item.method,item.number);if(url)tracking.set(url,{carrier:item.method,number:item.number,url});}
   }
  }
 }
 if(seen.size!==expected.size)issues.add('missing-order-lines');
 // Do not add parent/subline/package quantities or interpret supplier text as carrier delivery.
 return {matched:issues.size===0,issues:[...issues],checkedAt:observation.checkedAt,salesOrderCount:sales.size,backordered,tracking:issues.size?[]:[...tracking.values()].slice(0,100),deliveryConfirmed:false};
}
export function createSupplierHandoff({env=process.env,orders=createFinalOrderStore({env}),checkout=createCartCheckoutService({env}),sourcing=record=>createOrderFinalization({env}).assertCheckoutReady(record.owner,record.id),td=createTdReadonly({env}),store=createOrderExtensionStore({area:'supplier-handoff',env}),clock=()=>Date.now()}={}){
 const guard=()=>{previewMerchant(env);if(env.TP_SUPPLIER_HANDOFF_PREVIEW_ENABLED!=='true')fault('Supplier handoff preview has not been activated.',503);};
 const enabled=()=>env.VERCEL_ENV==='preview'&&env.TP_SUPPLIER_HANDOFF_PREVIEW_ENABLED==='true';
 function view(r){const prepared=r?.state==='prepared'&&fresh(r.checkedAt,clock(),60000)&&fresh(r.paymentCheckedAt,clock(),60000)&&Date.parse(r.quoteExpiresAt)>clock();return {mode:'test',orderId:r?.orderId||null,revision:r?.revision||0,reference:r?.reference||null,state:!r?'not-prepared':r.state==='checking'?'checking':r.state==='prepared'&&!prepared?'preflight-expired':r.state,preflightPassed:prepared,checkedAt:r?.checkedAt||null,reasons:r?.reasons||[],supplierObservation:r?.observation?{...r.observation,fresh:fresh(r.observation.checkedAt,clock(),900000)&&r.state==='matched'}:null,submissionImplemented:false,supplierOrderSubmitted:false,realSupplierDispatchAllowed:false,emailSent:false};}
 async function load(id){const r=await finalized(orders,id),entry=await store.read(id);if(entry&&(entry.record.seal!==orderSeal(r)||entry.record.supplierScope!==trackingScope(env)||entry.record.reference!==supplierReference(env,id)))fault('The finalized order differs from its saved supplier handoff.',409);return {r,entry};}
 async function save(id,next,etag){try{await store.save(id,next,etag);}catch{const seen=await store.read(id);if(seen?.record.completedRequest!==next.completedRequest||seen?.record.revision!==next.revision)fault('Supplier handoff changed or its save is uncertain. Reload before retrying.',409);}const seen=await store.read(id);if(seen?.record.revision!==next.revision||seen.record.completedRequest!==next.completedRequest)fault('Supplier handoff save could not be confirmed.',503);return view(seen.record);}
 async function operation(input,kind){guard();fields(input,['orderId','requestId','expectedRevision','consent']);orderId(input.requestId);if(input.consent!==true||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fault('Confirm this read-only supplier operation.');let {r,entry}=await load(input.orderId);
  const requestDigest=hash([kind,input.orderId,input.expectedRevision]);if(entry?.record.completedRequest===input.requestId){if(entry.record.requestDigest!==requestDigest)fault('Request ID was reused for a different operation.',409);return view(entry.record);}
  if((entry?.record.revision||0)!==input.expectedRevision)fault('Supplier handoff changed. Reload before retrying.',409);
  if(entry?.record.state==='checking'&&fresh(entry.record.startedAt,clock(),60000))fault('A supplier check is already running.',409);
  if(kind==='reconcile'&&!entry)fault('Prepare this order handoff before checking its supplier reference.',409);
  const startedAt=new Date(clock()).toISOString(),claim={...(entry?.record||{}),schemaVersion:1,kind:'supplier-handoff',mode:'test',orderId:r.id,seal:orderSeal(r),revision:input.expectedRevision+1,reference:supplierReference(env,r.id),supplierScope:trackingScope(env),quoteExpiresAt:r.order.quoteExpiresAt,state:'checking',startedAt,activeRequest:input.requestId,requestDigest,completedRequest:null,reasons:[],observation:null};
  try{await store.save(r.id,claim,entry?.etag||null);}catch{const seen=await store.read(r.id);if(seen?.record.activeRequest!==input.requestId||seen.record.state!=='checking'||seen.record.requestDigest!==requestDigest||seen.record.revision!==claim.revision)fault('Another request owns this supplier check.',409);}
  let result={state:'held',reasons:[],checkedAt:new Date(clock()).toISOString(),observation:null};
  try{
   if(kind==='prepare'){
    const payment=await checkout.administratorReconcile({orderId:r.id,recoveryConsent:true});
    if(payment.id!==r.id||payment.mode!=='test'||payment.captureConfirmed!==true||payment.paymentGatePassed!==true||payment.realSupplierDispatchAllowed!==false||!fresh(payment.paymentVerifiedAt,clock(),60000))result.reasons=['captured-payment-required'];
    else {await sourcing(r);const again=await finalized(orders,r.id);if(orderSeal(again)!==claim.seal||Date.parse(r.order.quoteExpiresAt)<=clock()||!fresh(payment.paymentVerifiedAt,clock(),60000))fault('Order or payment evidence expired during preflight.',409);result={...result,state:'prepared',paymentCheckedAt:payment.paymentVerifiedAt,checkedAt:new Date(clock()).toISOString()};}
   }else{
    const config=td.orderStatusConfiguration();if(config.enabled!==true||config.environment!=='uat')fault('Only the separately enabled TD UAT read-only connection may reconcile test handoffs.',503);
    const observation=await td.orderStatus({referenceType:'PO',reference:claim.reference}),matched=matchSupplierObservation(r.order,claim.reference,observation,{now:clock(),startedAt:Date.parse(startedAt)});
    result={...result,state:matched.matched?'matched':'needs-review',reasons:matched.issues,checkedAt:new Date(clock()).toISOString(),observation:matched};
   }
  }catch(e){result={...result,state:'held',reasons:[kind==='prepare'?'preflight-check-unverified':e?.code==='order_not_found'?'supplier-not-found-do-not-resubmit':'supplier-check-unverified'],observation:null};}
  const current=await store.read(r.id);if(current?.record.activeRequest!==input.requestId||current.record.state!=='checking')fault('A newer supplier check superseded this result.',409);
  const again=await finalized(orders,r.id);if(orderSeal(again)!==claim.seal)result={...result,state:'held',reasons:['order-changed'],observation:null};
  return save(r.id,{...current.record,...result,revision:current.record.revision+1,activeRequest:null,completedRequest:input.requestId},current.etag);
 }
 return {
  configuration(){const c=td.orderStatusConfiguration();return {enabled:enabled(),uatReadsEnabled:c.enabled===true&&c.environment==='uat',submissionImplemented:false};},
  async read(id){previewMerchant(env);const {entry}=await load(id),result={...view(entry?.record),orderId:id};if(result.preflightPassed){const payment=await checkout.administratorRead(id);if(payment.captureConfirmed!==true||payment.paymentGatePassed!==true)return {...result,state:'payment-review-required',preflightPassed:false,reasons:['saved-payment-approval-no-longer-current']};}return result;},
  prepare:input=>operation(input,'prepare'),reconcile:input=>operation(input,'reconcile'),
  async buyerView(id){previewMerchant(env);const {entry}=await load(id),r=entry?.record,visible=r?.state==='matched'&&r.observation?.matched===true&&fresh(r.observation.checkedAt,clock(),900000);return {state:visible?(r.observation.backordered?'supplier-reported-backorder':'supplier-record-matched'):r?.state==='matched'?'supplier-update-stale':'supplier-not-confirmed',observedAt:visible?r.observation.checkedAt:null,tracking:visible?r.observation.tracking.map(x=>({carrier:x.carrier,number:x.number,url:trackingURL(x.carrier,x.number)})).filter(x=>x.url):[],deliveryConfirmed:false,supplierOrderSubmitted:false};}
 };
}
