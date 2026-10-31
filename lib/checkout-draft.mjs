import {readVersionedPrivateBlob} from './blob-versioned-read.mjs';
// A private checkout review is NOT an order, payment authorization, or stock reservation.
import {createHash,randomUUID} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {cartId} from './shop-cart-store.mjs';
export const CHECKOUT_NOTICE='checkout-preview-2026-10-21';
const STATES=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const text=(v,name,max=120,optional=false)=>{if(optional&&(v===undefined||v===''))return '';if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw new HttpError(400,'Invalid '+name+'.');return v.trim();};
const fields=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(x=>!allowed.includes(x)))throw new HttpError(400,'Unexpected checkout fields.');};
export function validateCheckout(input){fields(input,['requestId','revision','contact','address','noticeVersion','consent']);cartId(input.requestId);if(!Number.isSafeInteger(input.revision)||input.revision<0)throw new HttpError(400,'Invalid cart revision.');if(input.consent!==true||input.noticeVersion!==CHECKOUT_NOTICE)throw new HttpError(400,'Acknowledge the private checkout-review notice.');fields(input.contact,['name','email','organization','phone']);fields(input.address,['line1','line2','city','state','postalCode','country']);
 const contact={name:text(input.contact.name,'contact name'),email:text(input.contact.email,'email',254).toLowerCase(),organization:text(input.contact.organization,'organization',160,true),phone:text(input.contact.phone,'phone',40,true)};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))throw new HttpError(400,'Enter a valid email address.');
 const address={line1:text(input.address.line1,'street address',180),line2:text(input.address.line2,'address line 2',100,true),city:text(input.address.city,'city',100),state:text(input.address.state,'state',2).toUpperCase(),postalCode:text(input.address.postalCode,'ZIP',5),country:input.address.country};
 if(!STATES.has(address.state)||!/^\d{5}$/.test(address.postalCode)||address.country!=='US')throw new HttpError(400,'The preview currently validates US addresses and five-digit ZIP codes.');
 return {requestId:input.requestId,revision:input.revision,contact,address,noticeVersion:CHECKOUT_NOTICE,consent:true};
}
export const checkoutFingerprint=input=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
export const CHECKOUT_MAX_AGE_MS=900000;
export const CHECKOUT_PREPARING_MS=120000;
const boundCents=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000000;
export function checkoutFault(code,message,status=409){const e=new HttpError(status,message);e.checkoutCode=code;return e;}
export function checkoutView(record,{nowMs=Date.now(),cartRevision,productRevision,settingsRevision}={}){
 const created=Date.parse(record.createdAt),expiry=Date.parse(record.expiresAt),checked=Date.parse(record.quoteCheckedAt),quoteUntil=Date.parse(record.quoteValidUntil);
 const validTime=[nowMs,created,expiry,checked,quoteUntil].every(Number.isFinite)&&created<=nowMs+30000&&checked<=created+30000&&expiry<=created+CHECKOUT_MAX_AGE_MS&&expiry<=quoteUntil&&quoteUntil<=checked+CHECKOUT_MAX_AGE_MS;
 const rawItems=Array.isArray(record.items)?record.items:[],identities=new Set();
 const validItems=rawItems.length>0&&rawItems.length<=20&&rawItems.every(x=>{
  if(!x||typeof x.sku!=='string'||!/^[1-9]\d{0,11}$/.test(x.sku)||identities.has(x.sku)||typeof x.partNumber!=='string'||typeof x.manufacturer!=='string'||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>9999)return false;
  identities.add(x.sku);return (x.unitPriceCents===null&&x.lineTotalCents===null)||(boundCents(x.unitPriceCents)&&x.unitPriceCents>0&&boundCents(x.lineTotalCents)&&x.lineTotalCents===x.unitPriceCents*x.quantity&&x.currency==='USD');
 });
 const computed=validItems&&rawItems.every(x=>x.lineTotalCents!==null)?rawItems.reduce((n,x)=>n+x.lineTotalCents,0):null;
 const totalsValid=record.subtotalCents===computed&&(record.deliveryEstimateCents===null||boundCents(record.deliveryEstimateCents))&&record.estimatedBeforeTaxCents===(computed!==null&&record.deliveryEstimateCents!==null?computed+record.deliveryEstimateCents:null);
 const reasons=[];
 if(record.schemaVersion!==2||record.phase!=='prepared'||!validTime||!validItems||!totalsValid)reasons.push('This review needs a fresh cart check before its prices can be displayed.');
 const expired=validTime&&expiry<=nowMs;if(expired)reasons.push('This saved checkout review has expired. Recheck your cart before continuing.');
 if(cartRevision!==undefined&&record.cartRevision!==cartRevision)reasons.push('Your cart changed after this review was saved. Recheck the current cart.');
 if(productRevision!==undefined&&record.productRevision!==productRevision)reasons.push('Product or resale rules changed. Recheck before continuing.');
 if(settingsRevision!==undefined&&record.settingsRevision!==settingsRevision)reasons.push('Pricing settings changed. Recheck the current cart.');
 const stale=reasons.length>0;
 return {id:record.id,reference:record.reference,status:expired?'expired-review':stale?'recheck-required':'payment-not-enabled',createdAt:record.createdAt,expiresAt:validTime?record.expiresAt:null,cartRevision:record.cartRevision,needsRecheck:stale,
  items:rawItems.slice(0,20).filter(x=>x&&typeof x==='object').map(x=>({sku:x.sku,partNumber:x.partNumber,manufacturer:x.manufacturer,title:x.title,quantity:x.quantity,unitPriceCents:stale?null:x.unitPriceCents,lineTotalCents:stale?null:x.lineTotalCents,availability:stale?'unknown':x.availability})),
  subtotalCents:stale?null:record.subtotalCents,deliveryEstimateCents:stale?null:record.deliveryEstimateCents,estimatedBeforeTaxCents:stale?null:record.estimatedBeforeTaxCents,taxCents:null,totalCents:null,currency:!stale&&computed!==null?'USD':null,
  holds:[...reasons,...(Array.isArray(record.holds)?record.holds:[]).filter(x=>typeof x==='string')],paymentCollected:false,orderPlaced:false,supplierOrderSubmitted:false,emailSent:false,inventoryReserved:false,canPay:false,preview:true};
}
const conflict=e=>/already.?exists|precondition|etag_conflict/i.test((e?.name||'')+' '+(e?.message||''));
function assertRecord(r,owner,id){if(!r||![1,2].includes(r.schemaVersion)||r.mode!=='preview'||r.owner!==owner||r.id!==id)throw new HttpError(503,'Unexpected checkout record.');return r;}
function existingResult(record,fingerprint,now){
 if(record.phase==='discarded')throw checkoutFault('checkout_discarded','This review was discarded. Start a new review to continue.',410);
 if(record.requestFingerprint!==fingerprint)throw checkoutFault('checkout_request_conflict','This request reference was used for different details. Start a new review.');
 if(record.phase==='preparing'){
  const active=Number.isFinite(Date.parse(record.claimedAt))&&now-Date.parse(record.claimedAt)<CHECKOUT_PREPARING_MS;
  const e=checkoutFault(active?'checkout_in_progress':'checkout_restart_required',active?'This review is still being checked. Retry the same request shortly.':'This review did not finish. Discard it and start a new review.');if(active)e.retryAfter=3;throw e;
 }
 if(record.phase==='failed')throw checkoutFault('checkout_restart_required','This review could not be completed. Discard it and start a new review.');
 if(record.phase!=='prepared'&&record.schemaVersion!==1)throw new HttpError(503,'Unexpected checkout state.');
 return {acquired:false,record};
}
function lifecycle({load,write,clock=()=>Date.now()}){
 const scope=(owner,id)=>{cartId(owner);cartId(id);};
 return {
  async read(owner,id){scope(owner,id);return (await load(owner,id))?.record||null;},
  async begin(owner,id,fingerprint){scope(owner,id);if(!/^[a-f0-9]{64}$/.test(fingerprint))throw new HttpError(400,'Invalid review request.');
   for(let attempt=0;attempt<4;attempt++){
    const current=await load(owner,id);if(current)return existingResult(current.record,fingerprint,clock());
    const claim={schemaVersion:2,mode:'preview',owner,id,phase:'preparing',requestFingerprint:fingerprint,claimedAt:new Date(clock()).toISOString(),claimToken:randomUUID()};
    try{await write(claim,null);return {acquired:true,claimToken:claim.claimToken};}catch(e){if(!conflict(e))throw e;}
   }throw checkoutFault('checkout_in_progress','Another request is checking this review. Retry the same request shortly.');
  },
  async complete(record,claimToken){scope(record.owner,record.id);const current=await load(record.owner,record.id);if(!current)throw checkoutFault('checkout_restart_required','The review request could not be found. Start a new review.');
   if(current.record.phase!=='preparing'){const prior=existingResult(current.record,record.requestFingerprint,clock());return {record:prior.record,created:false};}
   if(current.record.claimToken!==claimToken||current.record.requestFingerprint!==record.requestFingerprint)throw checkoutFault('checkout_request_conflict','Another request owns this review.');
   const saved={...record,schemaVersion:2,phase:'prepared'};
   try{await write(saved,current.etag);return {record:saved,created:true};}catch(e){
    // An ambiguous network response may follow a successful durable write. Read it,
    // but never blindly retry a completion over a cancellation marker.
    let latest;try{latest=await load(record.owner,record.id);}catch{throw e;}
    if(latest?.record.phase==='discarded')throw checkoutFault('checkout_discarded','This review was discarded while it was being checked.',410);
    if(latest?.record.phase==='prepared'&&latest.record.requestFingerprint===record.requestFingerprint)return {record:latest.record,created:false};
    if(conflict(e))throw checkoutFault('checkout_request_conflict','The review changed while being saved. Recheck its status.');throw e;
   }
  },
  async fail(owner,id,claimToken){scope(owner,id);for(let attempt=0;attempt<3;attempt++){const current=await load(owner,id);if(!current||current.record.phase!=='preparing'||current.record.claimToken!==claimToken)return;
   const failed={schemaVersion:2,mode:'preview',owner,id,phase:'failed',requestFingerprint:current.record.requestFingerprint,failedAt:new Date(clock()).toISOString()};try{await write(failed,current.etag);return;}catch(e){if(!conflict(e))throw e;}}
  },
  async remove(owner,id){scope(owner,id);for(let attempt=0;attempt<5;attempt++){const current=await load(owner,id);if(current?.record.phase==='discarded')return {discarded:true};
   // Retain only a non-contact cancellation marker so an old retry cannot resurrect PII.
   const marker={schemaVersion:2,mode:'preview',owner,id,phase:'discarded',discardedAt:new Date(clock()).toISOString()};
   try{await write(marker,current?.etag||null);return {discarded:true};}catch(e){if(!conflict(e))throw e;}
  }throw checkoutFault('checkout_request_conflict','The review is changing. Retry discard to confirm removal.');}
 };
}
async function boundedRecord(response){
 if(!response?.stream)throw new HttpError(503,'Checkout record is unavailable.');
 const reader=response.stream.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();throw new HttpError(503,'Invalid checkout record.');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(e){throw new HttpError(503,'Invalid checkout record.');}
}
export function createCheckoutStore({env=process.env,blob={get,put},clock=()=>Date.now()}={}){
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Checkout review has not been released.');};const path=(o,i)=>'preview/checkout-reviews/'+cartId(o)+'/'+cartId(i)+'.json';
 const load=async(owner,id)=>{guard();try{const result=await readVersionedPrivateBlob(blob,path(owner,id));if(!result)return null;const record=assertRecord(await boundedRecord(result),owner,id),etag=result.blob?.etag;if(typeof etag!=='string'||!etag)throw new HttpError(503,'Checkout storage version is unavailable.');return {record,etag};}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}};
 const write=async(record,etag)=>{guard();assertRecord(record,record.owner,record.id);const raw=JSON.stringify(record);if(Buffer.byteLength(raw)>100000)throw new HttpError(400,'Invalid checkout review.');await blob.put(path(record.owner,record.id),raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false})});};
 return lifecycle({load,write,clock});
}
export function memoryCheckoutStore({clock=()=>Date.now()}={}){
 const rows=new Map();let counter=0;const key=(o,i)=>cartId(o)+'/'+cartId(i);
 return lifecycle({clock,load:async(o,i)=>{const entry=rows.get(key(o,i));return entry?structuredClone(entry):null;},write:async(r,etag)=>{const k=key(r.owner,r.id),old=rows.get(k);if((old?.etag||null)!==etag)throw Error('etag_conflict');rows.set(k,{record:structuredClone(r),etag:String(++counter)});}});
}
