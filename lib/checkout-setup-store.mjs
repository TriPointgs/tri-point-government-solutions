// Private preparation only. Never writes final-order merchant-policy or activation flags.
import {createHash} from 'node:crypto';
import {get,put} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {readVersionedPrivateBlob} from './blob-versioned-read.mjs';
const fail=(text,status=400)=>{throw new HttpError(status,text);};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))fail('Unexpected setup fields. Approvals and activation flags cannot be submitted here.');};
export const setupAvailable=env=>env.VERCEL_ENV==='preview'&&/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||'');
export const emptySetupFields=()=>({termsVersion:'',termsText:'',shippingNotes:'',taxNotes:'',buyerAccess:'undecided',products:[]});
function text(v,max,label){if(typeof v!=='string'||Buffer.byteLength(v)>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))fail('Invalid '+label+'.');if(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}/.test(v))fail('Remove credentials from '+label+'. This workspace is for policy text, not secrets.');return v;}
export function normalizeSetupFields(value){
 exact(value,['termsVersion','termsText','shippingNotes','taxNotes','buyerAccess','products']);
 const fields={termsVersion:text(value.termsVersion,80,'terms version').trim(),termsText:text(value.termsText,30000,'purchase terms'),shippingNotes:text(value.shippingNotes,6000,'shipping notes'),taxNotes:text(value.taxNotes,6000,'tax review notes'),buyerAccess:value.buyerAccess,products:[]};
 if(fields.termsVersion&&!/^[A-Za-z0-9_.-]{3,80}$/.test(fields.termsVersion))fail('Terms version needs 3–80 letters, numbers, dots, underscores or hyphens.');
 if(!['undecided','guest','account','both'].includes(fields.buyerAccess))fail('Select a valid proposed buyer-access option.');
 if(!Array.isArray(value.products)||value.products.length>100)fail('At most 100 exact product classifications can be prepared at once.');
 const seen=new Set();
 for(const row of value.products){exact(row,['sku','manufacturerPart','taxCode']);const sku=text(typeof row.sku==='string'?row.sku.trim():row.sku,12,'SKU'),manufacturerPart=text(typeof row.manufacturerPart==='string'?row.manufacturerPart.trim():row.manufacturerPart,120,'manufacturer part'),taxCode=text(typeof row.taxCode==='string'?row.taxCode.trim():row.taxCode,13,'tax code');
  if(!/^[1-9]\d{0,11}$/.test(sku)||!manufacturerPart||!/^txcd_\d{8}$/.test(taxCode)||seen.has(sku))fail('Each classification needs a unique TD SKU, exact manufacturer part and txcd_ tax code with eight digits.');
  seen.add(sku);fields.products.push({sku,manufacturerPart,taxCode});
 }
 return fields;
}
function validateRecord(r){
 exact(r,['schemaVersion','kind','mode','state','revision','writeId','requestDigest','contentDigest','createdAt','updatedAt','fields']);
 if(r.schemaVersion!==1||r.kind!=='checkout-setup-draft'||r.mode!=='test'||r.state!=='draft'||!Number.isSafeInteger(r.revision)||r.revision<1||!uuid(r.writeId)||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.updatedAt))||Date.parse(r.createdAt)>Date.parse(r.updatedAt))fail('Stored setup draft is invalid.',503);
 const fields=normalizeSetupFields(r.fields),digest=hash(fields);
 if(digest!==r.contentDigest||hash([r.revision-1,fields])!==r.requestDigest)fail('Stored setup draft does not match its saved content.',503);
 return {...r,fields};
}
export function createCheckoutSetupStore({env=process.env,blob={get,put}}={}){
 const path=()=>{if(!setupAvailable(env))fail('Checkout setup requires a private preview and configured test merchant.',503);return 'preview/checkout-setup/v1/'+hash(['merchant-setup-draft',env.TP_STRIPE_TEST_ACCOUNT_ID])+'/draft.json';};
 return {
  async read(){let result;try{result=await readVersionedPrivateBlob(blob,path());}catch(e){if(e?.name==='BlobNotFoundError')return null;throw e;}if(!result)return null;
   const reader=result.stream.getReader(),chunks=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>75000){await reader.cancel();fail('Stored setup draft exceeds the size limit.',503);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
   let record;try{record=validateRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{fail('Stored setup draft could not be validated. It was not overwritten.',503);}return {record,etag:result.blob.etag};
  },
  async save(record,etag){const location=path();validateRecord(record);const raw=JSON.stringify(record);if(Buffer.byteLength(raw)>75000)fail('Setup draft exceeds the size limit.');await blob.put(location,raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}
 };
}
export function memoryCheckoutSetupStore(){let row=null,sequence=0;return {async read(){return structuredClone(row);},async save(record,etag){validateRecord(record);if((row?.etag||null)!==etag)throw Error('etag_conflict');row={record:structuredClone(record),etag:String(++sequence)};}};}
export function createCheckoutSetupService({env=process.env,store=createCheckoutSetupStore({env}),clock=()=>Date.now()}={}){
 const guard=()=>{if(!setupAvailable(env))fail('Checkout setup is unavailable for this environment or merchant.',503);};
 const project=record=>({mode:'test',state:'draft',revision:record?.revision||0,contentDigest:record?.contentDigest||null,updatedAt:record?.updatedAt||null,fields:record?.fields||emptySetupFields(),approved:false,checkoutActivated:false});
 return {
  async read(){guard();const row=await store.read();return project(row?.record);},
  async save(input){guard();exact(input,['writeId','expectedRevision','fields']);if(!uuid(input.writeId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER)fail('Invalid setup draft version or request identifier.');
   const fields=normalizeSetupFields(input.fields),requestDigest=hash([input.expectedRevision,fields]);let prior=await store.read();
   const matches=row=>row?.record.writeId===input.writeId&&row.record.requestDigest===requestDigest;
   if(prior?.record.writeId===input.writeId){if(!matches(prior))fail('This save identifier was already used for different draft content.',409);return {...project(prior.record),duplicate:true};}
   if((prior?.record.revision||0)!==input.expectedRevision)fail('Another editor changed this draft. Reload and compare before saving.',409);
   const at=new Date(clock()).toISOString(),record={schemaVersion:1,kind:'checkout-setup-draft',mode:'test',state:'draft',revision:input.expectedRevision+1,writeId:input.writeId,requestDigest,contentDigest:hash(fields),createdAt:prior?.record.createdAt||at,updatedAt:at,fields};
   try{await store.save(record,prior?.etag||null);}catch{
    let seen;try{seen=await store.read();}catch{fail('Save could not be verified. Retry this same save request.',503);}
    if(matches(seen))return {...project(seen.record),duplicate:true};
    if((seen?.record.revision||0)!==input.expectedRevision)fail('Another editor changed this draft. Reload and compare before saving.',409);
    fail('Save could not be verified. Retry this same save request.',503);
   }
   let observed;try{observed=await store.read();}catch{fail('Save could not be read back. Retry this same save request.',503);}
   if(!matches(observed))fail('Saved draft could not be confirmed; reload before starting another edit.',409);
   return {...project(observed.record),duplicate:false};
  }
 };
}
