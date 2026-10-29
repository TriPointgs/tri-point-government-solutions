// Exact-commit Preview maintenance: additive TEST webhook repair and create-only UNAPPROVED draft.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createCheckoutSetupService,normalizeSetupFields} from '../lib/checkout-setup-store.mjs';
const HOST='tri-point-government-solutions-git-feature-td-edc7b1-tri-point.vercel.app';
const EVENT='checkout.session.completed';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sameSet=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every(x=>b.includes(x));
export const launchPrepEnabled=e=>e.VERCEL_ENV==='preview'&&e.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&e.VERCEL_BRANCH_URL===HOST&&/^[a-f0-9]{40}$/.test(e.VERCEL_GIT_COMMIT_SHA||'')&&e.TP_LAUNCH_PREP_COMMIT===e.VERCEL_GIT_COMMIT_SHA;
async function json(r,max=300000){const reader=r.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('bounded');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
function endpoint(x){try{const u=new URL(x.url);return x.object==='webhook_endpoint'&&/^we_[A-Za-z0-9]+$/.test(x.id)&&x.livemode===false&&x.status==='enabled'&&u.protocol==='https:'&&u.hostname===HOST&&!u.username&&!u.password&&!u.port&&!u.hash&&u.pathname==='/api/payment-events'&&Array.isArray(x.enabled_events)&&x.enabled_events.length>0&&x.enabled_events.length<250&&new Set(x.enabled_events).size===x.enabled_events.length&&x.enabled_events.every(v=>typeof v==='string'&&/^(\*|[a-z0-9_.]+)$/.test(v));}catch{return false;}}
const identity=x=>sha([x.id,x.url,x.api_version??null,x.application??null,x.description??null,x.status,x.livemode,x.metadata??{}]);
export async function prepareLaunchBlockers({env=process.env,fetcher=fetch,setup,proposal,clock=()=>Date.now()}={}){
 if(!launchPrepEnabled(env))return {enabled:false,status:'skipped-exact-commit-gate'};
 const out={enabled:true,mode:'test',observedAt:new Date(clock()).toISOString(),webhook:{status:'not-checked'},transport:{status:'not-tested',actualStripeDeliveryVerified:false},draft:{status:'not-checked',approved:false},tax:{status:'not-checked',changed:false},paymentCreated:false,supplierRequested:false,publicRelease:false};
 const key=env.TP_STRIPE_TEST_SECRET_KEY;
 if(!/^(sk|rk)_test_[A-Za-z0-9]{8,}$/.test(key||'')||env.TP_STRIPE_TEST_READS_ENABLED!=='true'||!/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||'')){out.webhook.status='blocked-test-account-configuration';return out;}
 async function stripe(path,{events,idempotency}={}){
  const write=events!==undefined;
  if(!(path==='/v1/account'||path==='/v1/webhook_endpoints?limit=100'||path==='/v1/tax/settings'||/^\/v1\/webhook_endpoints\/we_[A-Za-z0-9]+$/.test(path))||(write&&!/^\/v1\/webhook_endpoints\/we_[A-Za-z0-9]+$/.test(path)))throw Error('route');
  const form=new URLSearchParams();if(write)for(const v of events)form.append('enabled_events[]',v);
  const r=await fetcher('https://api.stripe.com'+path,{method:write?'POST':'GET',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+key,Accept:'application/json',...(write?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotency}:{})},...(write?{body:form.toString()}:{}),signal:AbortSignal.timeout(12000)});
  if(!r.ok){await r.body?.cancel();throw Error('provider');}if(!/application\/json/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error('format');}return json(r);
 }
 try{const account=await stripe('/v1/account');if(account?.object!=='account'||account.id!==env.TP_STRIPE_TEST_ACCOUNT_ID)throw Error('account');}catch{out.webhook.status='blocked-account-unverified';return out;}
 let selected=null;
 try{
  const list=await stripe('/v1/webhook_endpoints?limit=100');if(list.object!=='list'||list.has_more!==false||!Array.isArray(list.data)||list.data.length>100)throw Error('incomplete-list');
  const matches=list.data.filter(endpoint);if(matches.length!==1){out.webhook.status='blocked-endpoint-not-unique';}
  else {
   const first=matches[0],path='/v1/webhook_endpoints/'+first.id;
   const current=await stripe(path);if(!endpoint(current)||identity(first)!==identity(current)||!sameSet(first.enabled_events,current.enabled_events))throw Error('changed');
   if(current.enabled_events.includes(EVENT)||current.enabled_events.includes('*')){selected=current;out.webhook={status:'already-subscribed',eventPresent:true,changed:false};}
   else {
    const afterEvents=[...current.enabled_events,EVENT];let replyConfirmed=false;
    try{const changed=await stripe(path,{events:afterEvents,idempotency:'tp-test-webhook-event-'+sha([current.id,current.enabled_events,EVENT])});replyConfirmed=endpoint(changed)&&identity(changed)===identity(current)&&sameSet(changed.enabled_events,afterEvents);}catch{/* Re-read the same endpoint. Never retry this write automatically. */}
    const verified=await stripe(path);if(!endpoint(verified)||identity(verified)!==identity(current)||!sameSet(verified.enabled_events,afterEvents)){out.webhook={status:'change-unverified-review-required',changed:'uncertain'};}
    else {selected=verified;out.webhook={status:'event-added-and-read-back',eventPresent:true,changed:true,existingSubscriptionsPreserved:true,endpointIdentityPreserved:true,replyConfirmed};}
   }
  }
 }catch{out.webhook={status:'inspection-or-change-unverified',changed:'unknown'};}
 if(selected&&/^whsec_[A-Za-z0-9]{8,}$/.test(env.TP_STRIPE_TEST_WEBHOOK_SECRET||'')){
  // Deliberately unrecognized NO-OP event. No payment/order identity, no provider record changes.
  const at=Math.floor(clock()/1000),raw=JSON.stringify({id:'evt_TPReadiness'+randomUUID().replaceAll('-',''),object:'event',type:'tp.readiness_probe',livemode:false,created:at,data:{object:{object:'tp_readiness_probe'}}});
  async function probe(valid){const mac=valid?createHmac('sha256',env.TP_STRIPE_TEST_WEBHOOK_SECRET).update(at+'.'+raw).digest('hex'):'0'.repeat(64);
   const r=await fetcher(selected.url,{method:'POST',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json','Stripe-Signature':'t='+at+',v1='+mac},body:raw,signal:AbortSignal.timeout(12000)});let body=null;try{if(/application\/json/i.test(r.headers.get('content-type')||''))body=await json(r,10000);else await r.body?.cancel();}catch{}return {status:r.status,body};}
  try{const bad=await probe(false);if(bad.status!==400||typeof bad.body?.error!=='string'){out.transport={status:'invalid-signature-not-confirmed-rejected',actualStripeDeliveryVerified:false};}
   else {const good=await probe(true);const ok=good.status===200&&good.body?.received===true&&good.body?.ignored===true&&good.body?.realSupplierDispatchAllowed===false;out.transport={status:ok?'signed-noop-accepted-invalid-signature-rejected':'signed-noop-not-confirmed',actualStripeDeliveryVerified:false,syntheticProbe:true,orderMutationRequested:false};}}
  catch{out.transport={status:'probe-unverified',actualStripeDeliveryVerified:false};}
 }
 try{const settings=await stripe('/v1/tax/settings');if(settings.object!=='tax.settings'||settings.livemode!==false)throw Error('tax');const missing=settings.status_details?.pending?.missing_fields;
  out.tax={status:settings.status==='active'?'active':settings.status==='pending'?'pending':'unrecognized',headOfficeRequired:Array.isArray(missing)&&missing.includes('head_office'),otherMissingRequirementCount:Array.isArray(missing)?missing.filter(x=>x!=='head_office').length:null,headOfficePresent:!!settings.head_office,changed:false,registrationReviewCompleted:false};
 }catch{out.tax={status:'read-unverified',changed:false};}
 try{
  const fields=normalizeSetupFields(proposal);if(!fields.termsText.startsWith('DRAFT FOR OWNER REVIEW - NOT APPROVED OR PUBLISHED')||fields.buyerAccess!=='undecided'||fields.products.length)throw Error('proposal');
  const svc=setup||createCheckoutSetupService({env}),prior=await svc.read();
  if(prior.revision>0)out.draft={status:'existing-draft-preserved',approved:false,matchingProposal:sha(prior.fields)===sha(fields)};
  else {await svc.save({writeId:'82a26cf4-50b6-4689-8a37-5dfb320cb23f',expectedRevision:0,fields});const readBack=await svc.read();if(readBack.approved!==false||readBack.checkoutActivated!==false||readBack.contentDigest!==sha(fields))throw Error('readback');out.draft={status:'proposal-saved-and-read-back',approved:false,checkoutActivated:false,productsClassified:false,buyerAccessDecided:false};}
 }catch{out.draft={status:'draft-save-unverified-or-conflict',approved:false};}
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!launchPrepEnabled(process.env))console.log('TP_LAUNCH_PREP skipped: no exact-commit authorization.');
 else try{const proposal=JSON.parse(readFileSync(new URL('../ops/merchant-launch-proposal.json',import.meta.url)));console.log('TP_LAUNCH_PREP_RESULT '+JSON.stringify(await prepareLaunchBlockers({proposal})));}catch{console.log('TP_LAUNCH_PREP_UNVERIFIED no raw error emitted.');process.exitCode=1;}
}
