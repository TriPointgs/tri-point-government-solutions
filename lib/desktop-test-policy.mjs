// Owner-confirmed policy for one private, staff-run Stripe TEST checkout.
// It is intentionally isolated from production terms and activation controls.
import {createHash} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {readVersionedPrivateBlob} from './blob-versioned-read.mjs';
import {BUSINESS_ADDRESS} from './business-address.mjs';
import {DESKTOP_REQUIRED_FREIGHT} from './stripe-tax-quote.mjs';
import {stripeMarketplaceConfiguration} from './stripe-payment-verifier.mjs';
import {normalizeSetupFields} from './checkout-setup-store.mjs';

const fail=(message,status=409)=>{throw new HttpError(status,message);};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textDigest=value=>createHash('sha256').update(value,'utf8').digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const ACCOUNT=/^acct_[A-Za-z0-9]{4,100}$/;
const SKU='14784711', PART='13B90032US', TAX_CODE='txcd_99999999';
const SCOPE='desktop-sandbox-v1';
const TERMS_VERSION='desktop-sandbox-v1';
const MAX_AGE=24*60*60*1000;
const address=Object.freeze({line1:BUSINESS_ADDRESS.streetAddress,city:BUSINESS_ADDRESS.addressLocality,state:BUSINESS_ADDRESS.addressRegion,postalCode:BUSINESS_ADDRESS.postalCode,country:BUSINESS_ADDRESS.addressCountry});
export const DESKTOP_TEST_TERMS=`STAFF SANDBOX TEST ONLY — NOT CUSTOMER TERMS\n\nThis private test is limited to one Lenovo ThinkCentre neo 50q Gen 5 Tiny desktop (TD SKU ${SKU}, Lenovo part ${PART}) and the displayed test-only amount. The test destination is Tri-Point Government Solutions LLC, ${BUSINESS_ADDRESS.streetAddress}, ${BUSINESS_ADDRESS.addressLocality}, ${BUSINESS_ADDRESS.addressRegion} ${BUSINESS_ADDRESS.postalCode}.\n\nThis is a Stripe TEST-mode exercise for Tri-Point staff. No live charge will be collected, no supplier order will be submitted, no inventory will be reserved, and no goods will be shipped or fulfilled. Use test payment details only. The displayed tax is a sandbox calculation for this exact scenario and is not tax advice or confirmation of a legal tax treatment.\n\nThis text is not public purchasing, shipping, return, cancellation, warranty, privacy, or exemption policy and does not approve production sales or customer-facing legal terms.`;

function guard(env){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='feature/td-product-controls'||!stripeMarketplaceConfiguration(env).configured)
  fail('Desktop test policy preparation requires the pinned private preview and Stripe TEST merchant.',503);
}
function normalizedDraft(draft){
 if(!draft||draft.mode!=='test'||draft.state!=='draft'||!Number.isSafeInteger(draft.revision)||draft.revision<1||!hex(draft.contentDigest)||!draft.fields||!Array.isArray(draft.fields.products))fail('A saved, current checkout draft is required before test-policy review.');
 let fields;try{fields=normalizeSetupFields(draft.fields);}catch{fail('The saved checkout draft is invalid.');}
 if(digest(fields)!==draft.contentDigest)fail('The saved checkout draft digest does not match its fields.');
 const products=fields.products;
 if(products.length!==1||products[0]?.sku!==SKU||products[0]?.manufacturerPart!==PART||products[0]?.taxCode!==TAX_CODE)
  fail('The saved draft must contain only the reviewed Lenovo desktop classification for this test.');
 for(const key of ['taxNotes','shippingNotes'])if(!fields[key].trim())fail('The saved tax and shipping review notes must be completed before owner review.');
 return {revision:draft.revision,contentDigest:draft.contentDigest,taxNotesDigest:textDigest(fields.taxNotes),shippingNotesDigest:textDigest(fields.shippingNotes)};
}
function candidateBase(sourceDraft){return {mode:'test',state:'owner-review-required',draftRevision:sourceDraft.revision,
  terms:{version:TERMS_VERSION,text:DESKTOP_TEST_TERMS},
  scope:{kind:SCOPE,sku:SKU,manufacturerPart:PART,quantity:1,address:{...address},sourceDraft},
  tax:{code:TAX_CODE,shippingTreatment:DESKTOP_REQUIRED_FREIGHT},
  shipping:{strategy:'merchant-fixed-from-td-zip-quote',taxTreatment:DESKTOP_REQUIRED_FREIGHT,estimateCents:null,source:'fresh exact quote required at order time'},
  expiresInHours:24};}
function candidateFrom(draft,env){
 guard(env);const sourceDraft=normalizedDraft(draft),candidate=candidateBase(sourceDraft);
 return {...candidate,candidateDigest:digest({accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,sourceDraft,candidate})};
}
export function desktopTestPolicyCandidate({draft,env=process.env}={}){return candidateFrom(draft,env);}
export const desktopTestPolicyCandidateDigest=candidate=>candidate?.candidateDigest;

function recordDigest(record){const {contentDigest,...content}=record;return digest(content);}
function policyContent({draft,env,now,actorFingerprint,revision,writeId,candidate}){
 const sourceDraft=candidate.scope.sourceDraft;
 const taxReview=digest({kind:'owner-confirmed-sandbox-tax-scenario-v1',draftRevision:sourceDraft.revision,draftContentDigest:sourceDraft.contentDigest,taxNotesDigest:sourceDraft.taxNotesDigest,sku:SKU,manufacturerPart:PART,taxCode:TAX_CODE,shippingTreatment:DESKTOP_REQUIRED_FREIGHT,accountId:env.TP_STRIPE_TEST_ACCOUNT_ID});
 const shippingReview=digest({kind:'owner-confirmed-sandbox-shipping-scenario-v1',draftRevision:sourceDraft.revision,draftContentDigest:sourceDraft.contentDigest,shippingNotesDigest:sourceDraft.shippingNotesDigest,sku:SKU,manufacturerPart:PART,quantity:1,address,accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,strategy:'merchant-fixed-from-td-zip-quote'});
 const at=new Date(now).toISOString();
 const policy={schemaVersion:1,kind:'merchant-checkout-policy',mode:'test',revision,createdAt:at,expiresAt:new Date(now+MAX_AGE).toISOString(),writeId,
  stripeTestAccountId:env.TP_STRIPE_TEST_ACCOUNT_ID,approvedByFingerprint:actorFingerprint,
  scope:{...candidate.scope,sourceDraft:{...sourceDraft},candidateDigest:candidate.candidateDigest},
  terms:{approved:true,version:TERMS_VERSION,text:DESKTOP_TEST_TERMS,contentDigest:textDigest(DESKTOP_TEST_TERMS),approvedAt:at},
  tax:{reviewed:true,products:[{sku:SKU,manufacturerPart:PART,code:TAX_CODE}],reviewEvidence:taxReview,shippingTreatment:DESKTOP_REQUIRED_FREIGHT},
  shipping:{approved:true,strategy:'merchant-fixed-from-td-zip-quote',taxTreatment:DESKTOP_REQUIRED_FREIGHT,reviewEvidence:shippingReview,estimateCents:null,source:'fresh exact quote required at order time'},
  approvalScope:'private staff sandbox scenario only; no production legal, tax, catalog or customer-facing approval',
  liveCheckoutEnabled:false,supplierOrderingEnabled:false,checkoutActivated:false};
 policy.contentDigest=recordDigest(policy);return policy;
}

function validStoredShape(record,now=Date.now()){
 const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
 if(!exact(record,['schemaVersion','kind','mode','revision','createdAt','expiresAt','writeId','stripeTestAccountId','approvedByFingerprint','scope','terms','tax','shipping','approvalScope','liveCheckoutEnabled','supplierOrderingEnabled','checkoutActivated','contentDigest'])||
  !exact(record.scope,['kind','sku','manufacturerPart','quantity','address','sourceDraft','candidateDigest'])||
  !exact(record.scope.address,['line1','city','state','postalCode','country'])||
  !exact(record.scope.sourceDraft,['revision','contentDigest','taxNotesDigest','shippingNotesDigest'])||
  !exact(record.terms,['approved','version','text','contentDigest','approvedAt'])||
  !exact(record.tax,['reviewed','products','reviewEvidence','shippingTreatment'])||!Array.isArray(record.tax.products)||record.tax.products.length!==1||
  !exact(record.tax.products[0],['sku','manufacturerPart','code'])||
  !exact(record.shipping,['approved','strategy','taxTreatment','reviewEvidence','estimateCents','source'])||
  record.schemaVersion!==1||record.kind!=='merchant-checkout-policy'||record.mode!=='test'||record.scope?.kind!==SCOPE||!Number.isSafeInteger(record.revision)||record.revision<1||
  !Number.isSafeInteger(record.scope.sourceDraft?.revision)||record.scope.sourceDraft.revision<1||!uuid(record.writeId)||!ACCOUNT.test(record.stripeTestAccountId||'')||!hex(record.approvedByFingerprint)||!hex(record.contentDigest)||record.contentDigest!==recordDigest(record)||
  record.terms?.approved!==true||record.terms.version!==TERMS_VERSION||record.terms.text!==DESKTOP_TEST_TERMS||record.terms.contentDigest!==textDigest(DESKTOP_TEST_TERMS)||!Number.isFinite(Date.parse(record.terms.approvedAt))||
  record.tax?.reviewed!==true||record.tax.products[0]?.sku!==SKU||record.tax.products[0]?.manufacturerPart!==PART||record.tax.products[0]?.code!==TAX_CODE||record.tax.shippingTreatment!==DESKTOP_REQUIRED_FREIGHT||!hex(record.tax.reviewEvidence)||
  record.shipping?.approved!==true||record.shipping.strategy!=='merchant-fixed-from-td-zip-quote'||record.shipping.taxTreatment!==DESKTOP_REQUIRED_FREIGHT||!hex(record.shipping.reviewEvidence)||record.shipping.estimateCents!==null||
  record.scope.sku!==SKU||record.scope.manufacturerPart!==PART||record.scope.quantity!==1||JSON.stringify(record.scope.address)!==JSON.stringify(address)||!hex(record.scope.sourceDraft?.contentDigest)||!hex(record.scope.sourceDraft?.taxNotesDigest)||!hex(record.scope.sourceDraft?.shippingNotesDigest)||!hex(record.scope.candidateDigest)||
  record.liveCheckoutEnabled!==false||record.supplierOrderingEnabled!==false||record.checkoutActivated!==false||record.approvalScope!=='private staff sandbox scenario only; no production legal, tax, catalog or customer-facing approval')fail('The saved desktop test policy is invalid or has been altered.',503);
 const created=Date.parse(record.createdAt),expires=Date.parse(record.expiresAt),approved=Date.parse(record.terms.approvedAt);
 if(!Number.isFinite(created)||!Number.isFinite(expires)||expires<=created||expires-created>MAX_AGE||approved!==created||created>now||approved>now)fail('The saved desktop test policy has invalid approval dates.',503);
 const sourceDraft=record.scope.sourceDraft,base=candidateBase(sourceDraft);
 if(record.scope.candidateDigest!==digest({accountId:record.stripeTestAccountId,sourceDraft,candidate:base})||
  record.tax.reviewEvidence!==digest({kind:'owner-confirmed-sandbox-tax-scenario-v1',draftRevision:sourceDraft.revision,draftContentDigest:sourceDraft.contentDigest,taxNotesDigest:sourceDraft.taxNotesDigest,sku:SKU,manufacturerPart:PART,taxCode:TAX_CODE,shippingTreatment:DESKTOP_REQUIRED_FREIGHT,accountId:record.stripeTestAccountId})||
  record.shipping.reviewEvidence!==digest({kind:'owner-confirmed-sandbox-shipping-scenario-v1',draftRevision:sourceDraft.revision,draftContentDigest:sourceDraft.contentDigest,shippingNotesDigest:sourceDraft.shippingNotesDigest,sku:SKU,manufacturerPart:PART,quantity:1,address,accountId:record.stripeTestAccountId,strategy:'merchant-fixed-from-td-zip-quote'}))fail('The saved desktop test policy evidence does not match its exact test scope.',503);
 return true;
}
export function validateDesktopTestPolicy(record,{draft,env=process.env,now=Date.now()}={}){
 validStoredShape(record,now);
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='feature/td-product-controls'||!stripeMarketplaceConfiguration(env).configured||record.stripeTestAccountId!==env.TP_STRIPE_TEST_ACCOUNT_ID||Date.parse(record.expiresAt)<=now)return false;
 let current;try{current=normalizedDraft(draft);}catch{return false;}
 return current.revision===record.scope.sourceDraft.revision&&current.contentDigest===record.scope.sourceDraft.contentDigest&&current.taxNotesDigest===record.scope.sourceDraft.taxNotesDigest&&current.shippingNotesDigest===record.scope.sourceDraft.shippingNotesDigest;
}

function storageAvailable(env){return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&stripeMarketplaceConfiguration(env).configured;}
const accountNamespace=env=>digest(['test-final-orders',env.TP_STRIPE_TEST_ACCOUNT_ID]);
export function createDesktopTestPolicyStore({env=process.env,blob={get,put}}={}){
 const path=()=>{if(!storageAvailable(env))fail('Desktop test policy storage is unavailable.',503);return 'preview/final-orders/v1/'+accountNamespace(env)+'/merchant-policy.json';};
 async function read(){let result;try{result=await readVersionedPrivateBlob(blob,path());}catch(e){if(e instanceof BlobNotFoundError||e?.name==='BlobNotFoundError')return null;throw e;}if(!result)return null;
  const reader=result.stream.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>50000){await reader.cancel();fail('Saved test policy exceeds its size limit.',503);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  try{return {record:JSON.parse(Buffer.concat(chunks).toString('utf8')),etag:result.blob.etag};}catch{fail('Saved test policy could not be read.',503);}
 }
 return {read,async save(record,etag){const raw=JSON.stringify(record);if(Buffer.byteLength(raw)>50000)fail('Test policy exceeds its size limit.');await blob.put(path(),raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}};
}
export function memoryDesktopTestPolicyStore(){let row=null,version=0;return {async read(){return row?structuredClone(row):null;},async save(record,etag){if((row?.etag||null)!==(etag||null))throw new Error('etag_conflict');row={record:structuredClone(record),etag:String(++version)};}};}

export function createDesktopTestPolicyService({env=process.env,drafts,store=createDesktopTestPolicyStore({env}),clock=()=>Date.now()}={}){
 if(!drafts||typeof drafts.read!=='function'||!store||typeof store.read!=='function'||typeof store.save!=='function')throw new TypeError('Draft and private policy stores are required.');
 async function freshCandidate(){guard(env);const draft=await drafts.read();return {draft,candidate:candidateFrom(draft,env)};}
 const projection=record=>({mode:'test',approved:true,policyRevision:record.revision,expiresAt:record.expiresAt,checkoutActivated:false,liveCheckoutEnabled:false,supplierOrderingEnabled:false});
 return {
  async candidate(){const {candidate}=await freshCandidate();return candidate;},
  async readApproved(){guard(env);await drafts.read();const row=await store.read();if(!row)return null;const draft=await drafts.read();return validateDesktopTestPolicy(row.record,{draft,env,now:clock()})?structuredClone(row.record):null;},
  async approve(input,{actorFingerprint}={}){
   guard(env);
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['writeId','draftRevision','candidateDigest','testConsent','reviewConsent'].includes(k))||!uuid(input.writeId)||!Number.isSafeInteger(input.draftRevision)||!hex(input.candidateDigest)||input.testConsent!==true||input.reviewConsent!==true)fail('Confirm this exact staff sandbox test policy for owner review.',400);
   if(!hex(actorFingerprint))fail('An authenticated staff approval fingerprint is required.',401);
   const {draft,candidate}=await freshCandidate();
   if(candidate.draftRevision!==input.draftRevision||candidate.candidateDigest!==input.candidateDigest)fail('The draft or test scenario changed. Review the current candidate again.',409);
   const old=await store.read();
   if(old){validStoredShape(old.record,clock());
    if(validateDesktopTestPolicy(old.record,{draft,env,now:clock()})){
     if(old.record.writeId===input.writeId&&old.record.scope.candidateDigest===input.candidateDigest&&old.record.approvedByFingerprint===actorFingerprint)return {...projection(old.record),duplicate:true};
     fail('An unexpired desktop test policy already exists. It cannot be replaced.',409);
    }
   }
   const record=policyContent({draft,env,now:clock(),actorFingerprint,revision:(old?.record.revision||0)+1,writeId:input.writeId,candidate});
   try{await store.save(record,old?.etag||null);}catch{
    const seen=await store.read(),latest=await drafts.read();if(seen&&seen.record?.writeId===input.writeId&&seen.record?.contentDigest===record.contentDigest&&validateDesktopTestPolicy(seen.record,{draft:latest,env,now:clock()}))return {...projection(seen.record),duplicate:true};
    fail('The policy changed concurrently or could not be confirmed. Reload the owner-review candidate.',409);
   }
   const seen=await store.read(),latest=await drafts.read();if(!seen||seen.record?.contentDigest!==record.contentDigest||!validateDesktopTestPolicy(seen.record,{draft:latest,env,now:clock()}))fail('Saved test policy could not be verified against the current draft. Do not proceed to checkout.',409);
   return {...projection(seen.record),duplicate:false};
  }
 };
}