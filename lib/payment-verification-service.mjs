import {isVerifiedCheckoutPayment} from './stripe-checkout-session.mjs';
import {createStripeSandboxCheckout} from './stripe-sandbox-checkout.mjs';
// Event delivery never calls TD. No HTTP endpoint can create/replace a payable binding.
import {createHash,randomUUID} from 'node:crypto';
import {HttpError} from './model.mjs';
import {bindingForFinalOrder,validateBinding,evaluatePaymentGate} from './payment-release-policy.mjs';
import {createStripePaymentVerifier,isVerifiedPaymentEvent} from './stripe-payment-verifier.mjs';
import {createPaymentVerificationStore,paymentRecordKey,paymentOrderKey,paymentConflict} from './payment-verification-store.mjs';
const bindingDigest=b=>digest({...b,createdAt:null});
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createPaymentVerificationService({env=process.env,verifier=createStripePaymentVerifier({env}),store=createPaymentVerificationStore({env}),clock=()=>Date.now(),sandboxCheckout=null}={}){
 const guard=()=>{if(env.VERCEL_ENV==='production'||!verifier.configuration().configured)throw new HttpError(503,'Test payment verification is not enabled. No payment or order can be submitted.');};
 const accountId=env.TP_STRIPE_TEST_ACCOUNT_ID;
 const keyFor=id=>paymentRecordKey(accountId,id);
 const publicResult=(record,duplicate=false)=>({received:true,duplicate,matched:true,mode:'test',policy:record.binding.policy,paymentGatePassed:record.paymentGatePassed===true&&record.riskHold!==true&&record.verification?.state==='idle'&&Date.parse(record.binding.expiresAt)>clock()&&Number.isFinite(Date.parse(record.verifiedAt))&&clock()-Date.parse(record.verifiedAt)<=60000,reasons:record.reasons||[],realSupplierDispatchAllowed:false,bankPayoutVerified:false,captureConfirmed:record.evidence?.captured===true&&record.riskHold!==true&&record.verification?.state==='idle'&&Number.isFinite(Date.parse(record.verifiedAt))&&Date.parse(record.verifiedAt)<=clock()+30000&&clock()-Date.parse(record.verifiedAt)<=60000,verifiedAt:record.verifiedAt||null,quoteExpired:Date.parse(record.binding.expiresAt)<=clock()});
 async function observe(paymentId,event=null){
  guard();const key=keyFor(paymentId),existing=await store.read(key);if(!existing)return {received:true,matched:false,mode:'test',realSupplierDispatchAllowed:false};
  if(event&&!isVerifiedPaymentEvent(event))throw new HttpError(400,'A signed provider event is required.');
  const old=existing.record,orderLink=await store.read(paymentOrderKey(accountId,old.binding.orderId));if(orderLink?.record.kind!=='order-link'||bindingDigest(orderLink.record.binding)!==bindingDigest(old.binding))throw new HttpError(503,'The order payment binding needs reconciliation. No supplier release is permitted.');if(event&&old.events.some(x=>x.id===event.id))return publicResult(old,true);
  const last=Date.parse(old.verification?.startedAt);if(old.verification?.state==='checking'&&Number.isFinite(last)&&clock()-last<60000&&event?.riskHold!==true){const e=new HttpError(409,'A payment check is in progress. Retry the same event.');e.retryAfter=5;throw e;}
  if(old.events.length>=200)throw new HttpError(409,'Payment event history needs reconciliation. No supplier release is allowed.');
  const token=randomUUID(),startedAt=new Date(clock()).toISOString(),claimed={...old,revision:old.revision+1,paymentGatePassed:false,reasons:['verification_pending'],riskHold:old.riskHold===true||event?.riskHold===true,verification:{state:'checking',token,startedAt},lastCompletedToken:null};
  try{await store.save(key,claimed,existing.etag);}catch(e){const recovered=await store.read(key);if(recovered?.record.verification?.token!==token)throw new HttpError(409,'Payment record changed. Retry the same event.');}
  let proof,checkError=false;
  try{proof=await verifier.verify(old.binding);}catch{checkError=true;}
  const current=await store.read(key);if(current?.record.verification?.token!==token)throw new HttpError(409,'A newer payment check superseded this result.');
  const result=checkError?{paymentGatePassed:false,reasons:['payment_recheck_failed']}:evaluatePaymentGate(current.record.binding,proof,{now:clock(),riskHold:current.record.riskHold});
  // Only a branded, authenticated read can pass. A failed API read is never recorded as paid.
  const cleanEvidence=proof?{source:proof.source,checkedAt:proof.checkedAt,provider:proof.provider,mode:proof.mode,chargeId:proof.chargeId,paymentId:proof.paymentId,amountCents:proof.amountCents,currency:proof.currency,captured:proof.captured,eligible:proof.eligible}:null;
  const completed={...current.record,revision:current.record.revision+1,verification:{state:'idle'},lastCompletedToken:token,paymentGatePassed:result.paymentGatePassed,verifiedAt:checkError?null:new Date(clock()).toISOString(),reasons:result.reasons,evidence:cleanEvidence,realSupplierDispatchAllowed:false};
  if(event&&!checkError)completed.events=[...completed.events,{id:event.id,type:event.type,observedAt:new Date(clock()).toISOString(),paymentGatePassed:result.paymentGatePassed}];
  try{await store.save(key,completed,current.etag);}catch{const saved=await store.read(key);if(saved?.record.lastCompletedToken!==token)throw new HttpError(503,'Payment verification persistence is uncertain. Retry the same event.');}
  if(checkError)throw new HttpError(503,'Current payment state could not be verified. Retry the same event; supplier submission remains blocked.');
  return publicResult(completed);
 }
 async function bind(binding){guard();const key=keyFor(binding.paymentId),orderKey=paymentOrderKey(accountId,binding.orderId),prior=await store.read(key);
   if(prior&&bindingDigest(prior.record.binding)!==bindingDigest(binding))throw new HttpError(409,'This payment is already assigned to a different order or quote.');
   let link=await store.read(orderKey);
   if(!link){const intent={schemaVersion:1,kind:'order-link',mode:'test',revision:1,binding};try{await store.save(orderKey,intent,null);link={record:intent};}catch{link=await store.read(orderKey);if(!link)throw new HttpError(503,'Order-payment linkage could not be confirmed. Retry the same binding.');}}
   if(link.record.kind!=='order-link'||bindingDigest(link.record.binding)!==bindingDigest(binding))throw new HttpError(409,'This order already has a different payment attempt or quote. Reconciliation is required.');
   if(prior)return {bound:true,duplicate:true};
   const record={schemaVersion:1,mode:'test',binding,revision:1,createdAt:new Date(clock()).toISOString(),events:[],riskHold:false,verification:{state:'idle'},paymentGatePassed:false,reasons:['captured_payment_required'],evidence:null,verifiedAt:null,realSupplierDispatchAllowed:false};
   try{await store.save(key,record,null);}catch{const saved=await store.read(key);if(saved&&bindingDigest(saved.record.binding)===bindingDigest(binding))return {bound:true,duplicate:true};throw new HttpError(409,'Payment binding changed concurrently. Recheck before retrying.');}return {bound:true,duplicate:false};
 }
 return {configuration:()=>({...verifier.configuration(),policy:'captured-before-supplier-v1',bindingCreationExposed:false}),
  // Server integration hook only: not called by checkout review or exposed through an admin paid switch.
  async bindFinalOrder(order,paymentId){guard();return bind(bindingForFinalOrder(order,{paymentId,accountId,now:clock()}));},
  async bindCheckoutOrder(order,proof){guard();if(!isVerifiedCheckoutPayment(proof)||proof.mode!=='test'||proof.accountId!==accountId||proof.orderId!==order.id||Date.parse(proof.checkedAt)>clock()+30000||clock()-Date.parse(proof.checkedAt)>60000)throw new HttpError(400,'A fresh server-verified Checkout linkage is required.');const binding=bindingForFinalOrder(order,{paymentId:proof.paymentId,accountId,now:Date.parse(proof.openedAt)});if(binding.quoteDigest!==proof.quoteDigest||binding.orderVersion!==proof.orderVersion)throw new HttpError(409,'Checkout binding mismatch.');return bind(binding);},
  async inspectOrder(orderId){guard();const link=await store.read(paymentOrderKey(accountId,orderId));if(!link)return {matched:false,realSupplierDispatchAllowed:false};const row=await store.read(keyFor(link.record.binding.paymentId));if(!row||bindingDigest(row.record.binding)!==bindingDigest(link.record.binding))throw new HttpError(503,'Order payment linkage is incomplete. Recheck this same order.');return publicResult(row.record);},
  async receive(raw,signature){guard();const event=verifier.parseEvent(raw,signature);if(!event)return {received:true,ignored:true,realSupplierDispatchAllowed:false};if(event.sandboxDemoId)return (sandboxCheckout||createStripeSandboxCheckout({env,clock})).receive(event);const paymentId=await verifier.eventPaymentId(event);return observe(paymentId,event);},
  async recheckBoundPayment(paymentId){return observe(paymentId);},
  async inspect(paymentId){guard();const entry=await store.read(keyFor(paymentId));return entry?publicResult(entry.record):{matched:false,realSupplierDispatchAllowed:false};}
 };
}
