// Opt-in, commit-pinned PREVIEW BUILD audit. No routes, record writes or provider mutations.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readVersionedPrivateBlob} from '../lib/blob-versioned-read.mjs';
import {normalizeSetupFields} from '../lib/checkout-setup-store.mjs';
const BRANCH='feature/td-product-controls';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const integer=x=>Number.isSafeInteger(x)&&x>=1;
const finite=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const exists=x=>typeof x==='string'&&x.length>0;
export const AUDIT_FLAGS=Object.freeze([
 'TP_TEST_ORDER_FINALIZATION_ENABLED','TP_CART_CHECKOUT_PREVIEW_ENABLED',
 'TP_STRIPE_TEST_CHECKOUT_ENABLED','TP_STRIPE_TEST_TAX_ENABLED','TP_STRIPE_TAX_SETUP_APPROVED',
 'TP_BUYER_PAYMENT_PREVIEW_ENABLED','TP_BUYER_PAYMENT_PILOT_APPROVED',
 'TP_TD_UAT_PILOT_APPROVED','TP_TD_UAT_SUBMIT_ENABLED'
]);
export const AUDIT_INPUTS=Object.freeze([
 'TP_BUYER_PAYMENT_PILOT_ORDER_ID','TP_TD_UAT_CLIENT_ID','TP_TD_UAT_CLIENT_SECRET',
 'TP_TD_UAT_CUSTOMER_NO','TP_TD_UAT_ACCOUNT_CURRENCY','TP_TD_UAT_PILOT_ORDER_ID','TP_TD_UAT_MAX_GOODS_CENTS'
]);
export function auditEnabled(env){
 return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===BRANCH&&
  /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA||'')&&
  env.TP_PILOT_READINESS_AUDIT===env.VERCEL_GIT_COMMIT_SHA;
}
async function parseBounded(stream,max){
 const reader=stream.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>max){await reader.cancel();throw Error('limit');}chunks.push(Buffer.from(value));}
 }finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function draftSummary(r){
 try{
  const f=normalizeSetupFields(r.fields);
  if(r.schemaVersion!==1||r.kind!=='checkout-setup-draft'||r.mode!=='test'||r.state!=='draft'||
    !integer(r.revision)||typeof r.writeId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.writeId||'')||!finite(r.createdAt)||!finite(r.updatedAt)||Date.parse(r.createdAt)>Date.parse(r.updatedAt)||
    r.contentDigest!==digest(f)||r.requestDigest!==digest([r.revision-1,f]))throw Error('shape');
  return {status:'present-valid-draft',termsTextPresent:!!f.termsText.trim(),shippingNotesPresent:!!f.shippingNotes.trim(),
   taxNotesPresent:!!f.taxNotes.trim(),buyerChoiceProposed:f.buyerAccess!=='undecided',productsPresent:f.products.length>0,
   approvalEstablished:false};
 }catch{return {status:'present-invalid-draft',approvalEstablished:false};}
}
function policySummary(r,now){
 const schema=r?.schemaVersion===1&&r.mode==='test'&&integer(r.revision);
 const terms=r?.terms,validText=typeof terms?.text==='string'&&!!terms.text.trim()&&Buffer.byteLength(terms.text)<=30000;
 const products=r?.tax?.products;
 const classifications=Array.isArray(products)&&products.length>0&&products.length<=100&&new Set(products.map(x=>x?.sku)).size===products.length&&
  products.every(x=>/^[1-9]\d{0,11}$/.test(x?.sku||'')&&typeof x.manufacturerPart==='string'&&!!x.manufacturerPart&&/^txcd_\d{8}$/.test(x.code||''));
 return {status:'present',schemaConsistent:schema,unexpired:finite(r?.expiresAt)&&Date.parse(r.expiresAt)>now,
  termsApprovalFlag:terms?.approved===true,termsTimestampConsistent:finite(terms?.approvedAt)&&Date.parse(terms.approvedAt)<=now,
  termsTextDigestMatches:validText&&hex(terms.contentDigest)&&createHash('sha256').update(terms.text).digest('hex')===terms.contentDigest,
  taxReviewFlag:r?.tax?.reviewed===true,taxReviewEvidencePresent:hex(r?.tax?.reviewEvidence),classificationsConsistent:classifications,
  shippingReviewFlag:r?.shipping?.approved===true,shippingStrategySupported:r?.shipping?.strategy==='merchant-fixed-from-td-zip-quote',
  shippingReviewEvidencePresent:hex(r?.shipping?.reviewEvidence),ownerApprovalIndependentlyVerified:false};
}
async function storageSummary(env,getBlob,now){
 if(!/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||''))return {status:'skipped-invalid-account-reference'};
 if(!exists(env.BLOB_READ_WRITE_TOKEN))return {status:'skipped-missing-storage-credential'};
 const account=env.TP_STRIPE_TEST_ACCOUNT_ID;
 const targets=[['draft','preview/checkout-setup/v1/'+digest(['merchant-setup-draft',account])+'/draft.json',75000],
  ['policy','preview/final-orders/v1/'+digest(['test-final-orders',account])+'/merchant-policy.json',100000]];
 const result={scope:'two-exact-configured-merchant-records',writes:0};
 for(const [kind,path,max]of targets){try{
  const blob=await readVersionedPrivateBlob({get:(p,o)=>getBlob(p,{...o,abortSignal:AbortSignal.timeout(12000)})},path);
  if(!blob){result[kind]={status:'absent'};continue;}
  let r;try{r=await parseBounded(blob.stream,max);}catch{result[kind]={status:'present-unreadable'};continue;}
  result[kind]=kind==='draft'?draftSummary(r):policySummary(r,now);
 }catch(e){result[kind]={status:e?.name==='BlobNotFoundError'?'absent':'read-unverified'};}}
 return result;
}
const STRIPE_PATHS=new Set(['/v1/account','/v1/webhook_endpoints?limit=100','/v1/tax/settings']);
async function stripeGet(fetcher,key,path){
 if(!STRIPE_PATHS.has(path))throw Error('path');
 try{
  const r=await fetcher('https://api.stripe.com'+path,{method:'GET',redirect:'error',cache:'no-store',
   headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok){try{await r.body?.cancel();}catch{}return {status:r.status===401?'authentication-rejected':r.status===403?'permission-denied':'http-error'};}
  if(!/application\/json/i.test(r.headers.get('content-type')||'')){try{await r.body?.cancel();}catch{}return {status:'invalid-response'};}
  return {status:'read',data:await parseBounded(r.body,300000)};
 }catch{return {status:'read-unverified'};}
}
function endpointMatches(endpoint,host){
 try{const u=new URL(endpoint.url);return u.protocol==='https:'&&u.hostname===host&&!u.port&&!u.username&&!u.password&&u.pathname==='/api/payment-events';}catch{return false;}
}
async function stripeSummary(env,fetcher){
 const result={source:'Stripe-test-key-GET-only',requests:0,account:{status:'not-checked'},webhooks:{status:'not-checked'},tax:{status:'not-checked'},
  webhookDeliveryVerified:false,webhookSecretMatchVerified:false,taxRegistrationsReviewed:false,productCheckoutTested:false};
 const key=env.TP_STRIPE_TEST_SECRET_KEY;
 if(!/^(sk|rk)_test_[A-Za-z0-9]{8,}$/.test(key||'')){result.account.status='skipped-missing-or-non-test-key';return result;}
 if(env.TP_STRIPE_TEST_READS_ENABLED!=='true'){result.account.status='skipped-test-reads-not-enabled';return result;}
 if(!/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||'')){result.account.status='skipped-invalid-account-reference';return result;}
 let r=await stripeGet(fetcher,key,'/v1/account');result.requests++;
 if(r.status!=='read'){result.account.status=r.status;return result;}
 if(r.data?.object!=='account'||r.data.id!==env.TP_STRIPE_TEST_ACCOUNT_ID){result.account.status='account-mismatch-or-invalid-response';return result;}
 result.account={status:'verified-configured-account',testKeyAuthenticated:true};
 r=await stripeGet(fetcher,key,'/v1/webhook_endpoints?limit=100');result.requests++;
 if(r.status!=='read')result.webhooks={status:r.status};
 else if(r.data?.object!=='list'||!Array.isArray(r.data.data)||r.data.data.length>100||typeof r.data.has_more!=='boolean')result.webhooks={status:'invalid-response'};
 else {
  const host=env.VERCEL_BRANCH_URL,hostValid=/^[a-z0-9.-]+\.vercel\.app$/.test(host||'');
  const matches=hostValid?r.data.data.filter(x=>x?.object==='webhook_endpoint'&&x.livemode===false&&x.status==='enabled'&&endpointMatches(x,host)):[];
  const events=matches.flatMap(x=>Array.isArray(x.enabled_events)?x.enabled_events:[]);
  result.webhooks={status:'read',firstPageComplete:!r.data.has_more,stablePreviewHostAvailable:hostValid,
   matchingEnabledEndpointObserved:matches.length>0,checkoutCompletedSubscribed:events.includes('*')||events.includes('checkout.session.completed'),
   paymentSucceededSubscribed:events.includes('*')||events.includes('payment_intent.succeeded'),
   refundSubscribed:events.includes('*')||events.includes('charge.refunded'),
   queryParametersPresent:matches.some(x=>new URL(x.url).search.length>0)};
 }
 r=await stripeGet(fetcher,key,'/v1/tax/settings');result.requests++;
 result.tax=r.status!=='read'?{status:r.status}:r.data?.object==='tax.settings'&&r.data.livemode===false?
  {status:'read',testMode:true,settingsActive:r.data.status==='active',defaultTaxCodePresent:typeof r.data.defaults?.tax_code==='string'}:{status:'invalid-or-live-response'};
 return result;
}
export async function auditPilotReadiness({env=process.env,getBlob,fetcher=fetch,clock=()=>Date.now()}={}){
 if(!auditEnabled(env))return {enabled:false,status:'skipped-not-exact-opt-in-preview-commit',providerRequests:0,storageWrites:0};
 const flags=Object.fromEntries(AUDIT_FLAGS.map(k=>[k,env[k]===undefined?'unset':env[k]==='true'?'enabled':env[k]==='false'?'disabled':'other-value']));
 const inputs=Object.fromEntries(AUDIT_INPUTS.map(k=>[k,exists(env[k])?'present-not-validated':'missing']));
 const snapshot={flags,inputs,stripeTestReadsEnabled:env.TP_STRIPE_TEST_READS_ENABLED==='true',
  webhookSecretFormatPresent:/^whsec_[A-Za-z0-9]{8,}$/.test(env.TP_STRIPE_TEST_WEBHOOK_SECRET||'')};
 return {enabled:true,sourceCommit:env.VERCEL_GIT_COMMIT_SHA,observedAt:new Date(clock()).toISOString(),
  execution:'preview-build-not-live-runtime',configuration:snapshot,
  storage:await storageSummary(env,getBlob,clock()),stripe:await stripeSummary(env,fetcher),
  paymentCreated:false,supplierRequested:false,emailSent:false,settingsChanged:false,approvedForPilot:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!auditEnabled(process.env))console.log('TP_READINESS_AUDIT skipped: no exact-commit opt-in.');
 else {try{
  const {get}=await import('@vercel/blob');
  const report=await auditPilotReadiness({getBlob:get});
  const {configuration,storage,stripe,...summary}=report;
  console.log('TP_READINESS_AUDIT_SUMMARY '+JSON.stringify(summary));
  console.log('TP_READINESS_AUDIT_FLAGS '+JSON.stringify(configuration.flags));
  console.log('TP_READINESS_AUDIT_INPUTS '+JSON.stringify({inputs:configuration.inputs,stripeTestReadsEnabled:configuration.stripeTestReadsEnabled,webhookSecretFormatPresent:configuration.webhookSecretFormatPresent}));
  console.log('TP_READINESS_AUDIT_STORAGE '+JSON.stringify(storage));
  console.log('TP_READINESS_AUDIT_STRIPE '+JSON.stringify(stripe));
 }catch{console.log('TP_READINESS_AUDIT_UNVERIFIED unexpected internal audit failure; no raw details emitted.');process.exitCode=1;}}
}
