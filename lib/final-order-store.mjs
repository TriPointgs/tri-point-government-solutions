// Private, preview-only finalization records. No public route or customer enumeration.
import {createHash} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {cartId} from './shop-cart-store.mjs';
import {HttpError} from './model.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=m=>{throw new HttpError(503,m);};
function merchant(env){if(env.VERCEL_ENV==='production'||env.TP_TEST_ORDER_FINALIZATION_ENABLED!=='true'||!/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||''))fail('Test order finalization is not enabled.');return hash(['test-final-orders',env.TP_STRIPE_TEST_ACCOUNT_ID]);}
export function finalizationOrderId(account,owner,review){if(!/^acct_[A-Za-z0-9]{4,100}$/.test(account||''))throw new HttpError(400,'Invalid merchant account.');cartId(owner);cartId(review);const b=Buffer.from(hash([account,owner,review]),'hex').subarray(0,16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function validate(r,id){if(!r||r.kind!=='checkout-finalization'||r.mode!=='test'||r.schemaVersion!==1||r.id!==id||!Number.isSafeInteger(r.revision)||r.revision<1||!['preparing','blocked','finalized'].includes(r.phase))fail('Invalid finalization record.');cartId(r.owner);cartId(r.reviewId);if(r.phase==='finalized'&&(r.order?.id!==id||r.order.kind!=='payable-order'||r.order.mode!=='test'))fail('Invalid finalized order.');return r;}
async function bounded(r){if(!r?.stream)fail('Private order record is unavailable.');const reader=r.stream.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();fail('Private order record is too large.');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Private order record is unreadable.');}}
export function createFinalOrderStore({env=process.env,blob={get,put}}={}){
 const path=id=>'preview/final-orders/v1/'+merchant(env)+'/'+cartId(id)+'.json';
 return {
  async read(id){let r;try{r=await blob.get(path(id),{access:'private',useCache:false});}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}if(!r)return null;if(!r.blob?.etag)fail('Order storage version is unavailable.');return {record:validate(await bounded(r),id),etag:r.blob.etag};},
  async save(id,record,etag){validate(record,id);const raw=JSON.stringify(record);if(Buffer.byteLength(raw)>100000)fail('Order record is too large.');await blob.put(path(id),raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}
 };
}
export function createFinalizationPolicyReader({env=process.env,blob={get}}={}){return {async read(){const path='preview/final-orders/v1/'+merchant(env)+'/merchant-policy.json';let r;try{r=await blob.get(path,{access:'private',useCache:false});}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}return r?bounded(r):null;}};}
export function memoryFinalOrderStore(){const rows=new Map();let seq=0;return {async read(id){cartId(id);return rows.has(id)?structuredClone(rows.get(id)):null;},async save(id,r,etag){validate(r,id);if((rows.get(id)?.etag||null)!==etag)throw Error('etag_conflict');rows.set(id,{record:structuredClone(r),etag:String(++seq)});}};}
