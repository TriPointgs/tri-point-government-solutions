import {createHash,randomUUID} from 'node:crypto';
import {HttpError} from './model.mjs';
import {createTdReadonly} from './tdsynnex-readonly.mjs';
import {orderSelector} from './td-order-status.mjs';
import {createTrackingStore,trackingId,isTrackingConflict} from './order-tracking-store.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function trackingScope(env){return hash(JSON.stringify(['td-order-status',env.TP_TD_API_ENVIRONMENT||'uat',env.TP_TD_CUSTOMER_NO||'',env.TP_TD_CLIENT_ID||'']));}
export function observationDigest(observation){return hash(JSON.stringify({environment:observation.environment,selector:observation.selector,orders:observation.orders,summary:observation.summary}));}
export function trackingProjection(record,{now=Date.now()}={}){
 const at=Date.parse(record.observation?.checkedAt),fresh=Number.isFinite(at)&&at<=now+30000&&now-at<900000&&!record.lastError;
 return {id:record.id,revision:record.revision,referenceType:record.selector.referenceType,reference:record.selector.reference,environment:record.environment,createdAt:record.createdAt,lastAttemptAt:record.lastAttemptAt,lastSuccessAt:record.lastSuccessAt||null,
  state:record.refresh?.state==='checking'?'checking':record.lastError?'check-failed':record.observation?fresh?'observed':'stale':'not-checked',fresh,lastError:record.lastError?{code:record.lastError.code,message:'The latest supplier check failed. Earlier data is historical, not a new confirmation.'}:null,
  observation:record.observation||null,events:(record.events||[]).slice(-100),eventCount:record.eventCount||0,source:'tdsynnex-order-status',preview:true,privateToStaff:true,customerOrderLinked:false,emailsSent:0,paymentVerified:false,deliveryConfirmed:false,orderSubmittedByThisRequest:false};
}
export function createOrderTracking({env=process.env,td=createTdReadonly({env}),scope=trackingScope(env),store=createTrackingStore({env,scope}),clock=()=>Date.now()}={}){
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Supplier order tracking has not been released to production.');};
 const config=()=>td.orderStatusConfiguration();
 const requireConfigured=()=>{const c=config();if(!c.enabled)throw new HttpError(503,'The existing approved read-only supplier connection must be enabled before checking order status.');return c;};
 async function refresh(id,expectedRevision){guard();trackingId(id);const cfg=requireConfigured();let current=await store.read(id);if(!current)throw new HttpError(404,'Supplier tracking record not found.');
  if(expectedRevision!==undefined&&(!Number.isSafeInteger(expectedRevision)||expectedRevision!==current.record.revision))throw new HttpError(409,'This record changed. Reload its latest status.');
  const prior=current.record,claimAt=Date.parse(prior.refresh?.startedAt);if(prior.refresh?.state==='checking'&&Number.isFinite(claimAt)&&clock()-claimAt<60000)throw new HttpError(409,'A supplier check is already running. Refresh the list shortly.');
  const token=randomUUID(),started=new Date(clock()).toISOString(),claimed={...prior,revision:prior.revision+1,lastAttemptAt:started,lastCompletedToken:null,refresh:{state:'checking',token,startedAt:started}};
  try{await store.save(claimed,current.etag);}catch(e){const recovered=await store.read(id);if(recovered?.record.refresh?.token!==token){if(isTrackingConflict(e))throw new HttpError(409,'Another request started this check. Reload the list.');throw e;}}
  let observation=null,problem=null;
  try{observation=await td.orderStatus(prior.selector);if(observation?.source!=='tdsynnex-order-status'||observation.identityMatched!==true||observation.environment!==cfg.environment||JSON.stringify(observation.selector)!==JSON.stringify(prior.selector)||!Number.isFinite(Date.parse(observation.checkedAt))||Date.parse(observation.checkedAt)<Date.parse(started)-30000||Date.parse(observation.checkedAt)>clock()+30000)throw new HttpError(502,'Supplier response could not be bound to this check.');}
  catch(e){const permitted=new Set(['order_business_error','order_not_found','order_identity_mismatch','order_status_unavailable','supplier_rate_limit','order_status_http_error','oauth_rejected','order_reads_disabled']);problem={code:permitted.has(e.code)?e.code:'order_check_unverified',at:new Date(clock()).toISOString()};}
  current=await store.read(id);if(!current||current.record.refresh?.token!==token)throw new HttpError(409,'A newer tracking check superseded this result. Reload the record.');
  let next={...current.record,revision:current.record.revision+1,refresh:{state:'idle'},lastError:problem,lastCompletedToken:token};
  if(observation&&!problem){const fingerprint=observationDigest(observation),changed=fingerprint!==current.record.observationFingerprint;next={...next,observation,observationFingerprint:fingerprint,lastSuccessAt:observation.checkedAt};
   if(changed){const event={id:hash(id+':'+next.revision+':'+fingerprint),kind:prior.observation?'supplier-update':'first-supplier-observation',observedAt:observation.checkedAt,trackingReferences:observation.summary.trackingReferences,backorderReported:observation.summary.backorderReported,supplierStates:observation.orders.map(x=>({salesOrder:x.salesOrder,status:x.supplierStatus})),notificationSent:false};next.events=[...(current.record.events||[]),event].slice(-100);next.eventCount=(current.record.eventCount||0)+1;}}
  try{await store.save(next,current.etag);}catch(e){const reread=await store.read(id);if(reread?.record.lastCompletedToken===token)return trackingProjection(reread.record,{now:clock()});throw new HttpError(409,'Tracking changed before the result could be confirmed. Reload to recover the saved state.');}
  return trackingProjection(next,{now:clock()});
 }
 return {configuration(){guard();return {...config(),preview:true,automaticPolling:false,orderSubmissionEnabled:false,emailDispatchEnabled:false};},
  async list(cursor){guard();const page=await store.page(cursor);return {...page,records:page.records.map(r=>trackingProjection(r,{now:clock()}))};},
  async read(id){guard();const data=await store.read(trackingId(id));if(!data)throw new HttpError(404,'Supplier tracking record not found.');return trackingProjection(data.record,{now:clock()});},
  async track(input){guard();const selector=orderSelector(input),cfg=requireConfigured(),id=hash(scope+JSON.stringify(selector)),existing=await store.read(id);if(existing)return {created:false,record:trackingProjection(existing.record,{now:clock()})};
   const record={schemaVersion:1,mode:'preview',scope,id,selector,environment:cfg.environment,createdAt:new Date(clock()).toISOString(),revision:0,events:[],eventCount:0,refresh:{state:'idle'},observation:null,lastError:null};
   try{await store.save(record,null);}catch(e){if(isTrackingConflict(e)){const saved=await store.read(id);if(saved)return {created:false,record:trackingProjection(saved.record,{now:clock()})};}throw e;}
   return {created:true,record:await refresh(id,0)};
  },refresh};
}
