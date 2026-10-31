// One-shot, exact-order TD UAT pilot. A durable send intent is never cleared for automatic retry.
import {randomUUID} from 'node:crypto';
import {createFinalOrderStore} from './final-order-store.mjs';
import {createCartCheckoutService} from './cart-checkout-service.mjs';
import {createOrderFinalization} from './checkout-finalization.mjs';
import {createTdUatPo} from './td-po-uat.mjs';
import {assertUatPilot,uatPoConfiguration,uatScope,procurementSeal,freshPoEvidence,validateUatPoPlan} from './td-po-contract.mjs';
import {fault,hash,fields,orderId,finalized,previewMerchant,createOrderExtensionStore} from './order-extension-store.mjs';
const LEASE_MS=120000;
export function createSupplierDispatch({env=process.env,orders=createFinalOrderStore({env}),checkout=createCartCheckoutService({env}),sourcing=r=>createOrderFinalization({env}).assertCheckoutReady(r.owner,r.id),adapter=createTdUatPo({env}),store=createOrderExtensionStore({area:'supplier-dispatch',env}),clock=()=>Date.now()}={}){
 const environment=Object.freeze({...env}),configuration=()=>uatPoConfiguration(environment);
 function projection(r,id){return {mode:'test',environment:'uat',orderId:id,revision:r?.revision||0,state:r?.state||'not-planned',reference:r?.plan?.reference||null,planDigest:r?.plan?.bodyDigest||null,goodsCents:r?.plan?.goodsCents??null,freightEstimateCents:r?.plan?.freightEstimateCents??null,freightGuaranteed:false,expiresAt:r?.plan?.expiresAt||null,attempted:r?.attempted===true,attemptCount:r?.attempted?1:0,checkedAt:r?.checkedAt||null,reason:r?.reason||null,supplierAccepted:r?.result?.accepted===true&&['acknowledged','reconciled'].includes(r?.state),automaticRetryAllowed:false,productionSubmissionEnabled:false,refundRequested:false,emailSent:false,releaseStopped:r?.releaseStopped===true,stoppedAt:r?.stoppedAt||null};}
 async function load(id){previewMerchant(environment);const order=await finalized(orders,id),entry=await store.read(id);if(entry&&(entry.record.seal!==procurementSeal(order)||(entry.record.scope!==uatScope(environment)&&!(entry.record.releaseStopped===true&&entry.record.attempted===false))))fault('Supplier pilot belongs to a different order, destination or UAT account.',409);return {order,entry};}
 async function persist(next,etag){try{await store.save(next.orderId,next,etag);}catch{const found=await store.read(next.orderId);if(found?.record.operation!==next.operation||found.record.revision!==next.revision)fault('Supplier pilot save is uncertain or changed. Reload this same order.',409);}const saved=await store.read(next.orderId);if(saved?.record.operation!==next.operation||saved.record.revision!==next.revision)fault('Supplier pilot save could not be read back.',503);return saved;}
 function inputFor(input,kind){fields(input,kind==='submit'?['orderId','requestId','expectedRevision','planDigest','consent']:['orderId','requestId','expectedRevision','consent']);orderId(input.orderId);orderId(input.requestId);if(input.consent!==true||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER-3||(kind==='submit'&&!/^[a-f0-9]{64}$/.test(input.planDigest||'')))fault('Confirm the exact versioned UAT pilot operation.',400);assertUatPilot(environment,input.orderId,{write:kind==='submit'});return hash([kind,input.orderId,input.expectedRevision,input.planDigest||null]);}
 async function start(input,kind){const requestDigest=inputFor(input,kind),{order,entry}=await load(input.orderId),r=entry?.record;
  if(kind!=='reconcile'&&r?.releaseStopped===true)fault('This order is permanently stopped before supplier release.',409);
  if(r?.completedRequest===input.requestId){if(r.requestDigest!==requestDigest)fault('Request identity was reused for another operation.',409);return {duplicate:projection(r,input.orderId)};}
  if((r?.revision||0)!==input.expectedRevision)fault('Supplier pilot changed. Reload its latest version.',409);
  if(r?.activeRequest&&Number.isFinite(Date.parse(r.startedAt))&&Date.parse(r.startedAt)+LEASE_MS>clock())fault('An existing supplier pilot operation is still in progress.',409);
  if(kind!=='reconcile'&&r?.attempted)fault('This order already has a durable supplier attempt. Reconcile it; never submit it again.',409);
  if(kind==='submit'&&(r?.state!=='planned'||r.plan?.bodyDigest!==input.planDigest))fault('Review the saved exact purchase plan before submission.',409);
  if(kind==='reconcile'&&!r?.attempted)fault('No supplier submission attempt exists to reconcile.',409);
  const claim={...(r||{}),schemaVersion:1,kind:'supplier-dispatch',mode:'test',orderId:order.id,seal:procurementSeal(order),scope:uatScope(environment),revision:input.expectedRevision+1,state:kind==='prepare'?'preparing':kind==='submit'?'validating':'checking',activeRequest:input.requestId,requestDigest,completedRequest:null,operation:randomUUID(),startedAt:new Date(clock()).toISOString(),reason:null,result:null,attempted:r?.attempted===true};
  return {order,row:await persist(claim,entry?.etag||null)};
 }
 async function current(id,operation){const row=await store.read(id);if(row?.record.operation!==operation)fault('A newer supplier operation superseded this result.',409);return row;}
 async function finish(row,result){const active=await current(row.record.orderId,row.record.operation),next={...active.record,...result,revision:active.record.revision+1,operation:randomUUID(),activeRequest:null,completedRequest:active.record.activeRequest,checkedAt:new Date(clock()).toISOString()};return projection((await persist(next,active.etag)).record,next.orderId);}
 async function captured(order){const p=await checkout.administratorReconcile({orderId:order.id,recoveryConsent:true});if(p.id!==order.id||p.mode!=='test'||!p.captureConfirmed||!p.paymentGatePassed||p.realSupplierDispatchAllowed!==false||!freshPoEvidence(p.paymentVerifiedAt,clock()))fault('Fresh captured test payment is required.',409);await sourcing(order);return p;}
 async function beforeSend(order,row,plan){assertUatPilot(environment,order.id,{write:true});validateUatPoPlan(plan,environment,{now:clock()});await sourcing(order);const [latest,payment,active]=await Promise.all([finalized(orders,order.id),checkout.administratorRead(order.id),current(order.id,row.record.operation)]);if(procurementSeal(latest)!==row.record.seal||active.record.releaseStopped===true||active.record.state!=='sending'||active.record.attempted!==true||active.record.plan.bodyDigest!==plan.bodyDigest||payment.captureConfirmed!==true||payment.paymentGatePassed!==true||!freshPoEvidence(payment.paymentVerifiedAt,clock())||Date.parse(latest.order.quoteExpiresAt)<=clock())fault('Current order, payment or dispatch intent could not be verified. Reconcile this reference.',409);}
 return {
  configuration,
  async read(id){const {entry}=await load(id);return projection(entry?.record,id);},
  async prepare(input){const begun=await start(input,'prepare');if(begun.duplicate)return begun.duplicate;const {order,row}=begun;let plan;
   try{await captured(order);plan=await adapter.plan(order);validateUatPoPlan(plan,environment,{now:clock()});const latest=await finalized(orders,order.id);if(plan.seal!==procurementSeal(latest)||plan.scope!==uatScope(environment))fault('Purchase plan no longer matches the order.',409);}catch{return finish(row,{state:'blocked',reason:'purchase-plan-or-payment-needs-review',plan:null});}
   return finish(row,{state:'planned',reason:null,plan});
  },
  async submit(input){const begun=await start(input,'submit');if(begun.duplicate)return begun.duplicate;const {order}=begun;let row=begun.row,plan;
   try{await captured(order);plan=await adapter.plan(order);validateUatPoPlan(plan,environment,{now:clock()});if(plan.bodyDigest!==row.record.plan.bodyDigest||plan.seal!==row.record.seal||plan.reference!==row.record.plan.reference)fault('Supplier cost, delivery method or destination changed. Prepare and review a new plan.',409);}catch{return finish(row,{state:'blocked',reason:'submission-preflight-changed',plan:null});}
   // No external write before the attempt has been durably saved and read back.
   row=await persist({...row.record,revision:row.record.revision+1,state:'sending',plan,attempted:true,attemptId:randomUUID(),attemptStartedAt:new Date(clock()).toISOString(),operation:randomUUID()},row.etag);
   let result;try{result=await adapter.submit(plan,{beforeSend:()=>beforeSend(order,row,plan)});if(!['acknowledged','rejected','uncertain'].includes(result?.state))throw Error('unexpected result');}catch{result={state:'uncertain',reason:'submission-result-uncertain-reconcile-only',accepted:false};}
   return finish(row,{state:result.state,reason:result.reason||null,result});
  },
  async reconcile(input){const begun=await start(input,'reconcile');if(begun.duplicate)return begun.duplicate;const {row}=begun;let result;
   try{result=await adapter.reconcile(row.record.plan);if(!['reconciled','uncertain'].includes(result?.state))throw Error('unexpected result');}catch{result={state:'uncertain',reason:'reconciliation-unavailable-do-not-resubmit',accepted:false};}
   return finish(row,{state:result.state,reason:result.reason||null,result});
  }
 };
}
