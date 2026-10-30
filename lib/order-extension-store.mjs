// Private TEST order extensions. No enumeration, public storage or production access.
import {createHash} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {readVersionedPrivateBlob} from './blob-versioned-read.mjs';
export const fault=(message,status=400)=>{throw new HttpError(status,message);};
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const orderId=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))fault('Invalid order reference.');return value;};
export function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))fault('Unexpected or missing request fields.');}
export const orderSeal=record=>hash([record.id,record.owner,record.reviewId,record.completedAt,record.order]);
export async function finalized(orders,id){orderId(id);const row=await orders.read(id),r=row?.record;if(!r||r.phase!=='finalized'||r.mode!=='test'||r.order?.mode!=='test'||r.order.kind!=='payable-order'||r.order.id!==id)fault('Saved test order not found.',404);return r;}
export function previewMerchant(env){if(env.VERCEL_ENV!=='preview'||!/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||''))fault('This feature requires a configured private test merchant.',503);return hash(['test-order-extensions',env.TP_STRIPE_TEST_ACCOUNT_ID]);}
const areas=new Set(['buyer-access','supplier-handoff','supplier-dispatch','order-updates','buyer-payment','order-refund']);
export function createOrderExtensionStore({area,env=process.env,blob={get,put}}={}){
 if(!areas.has(area))throw Error('Unsupported extension area');
 const path=id=>'preview/order-extensions/v1/'+previewMerchant(env)+'/'+area+'/'+orderId(id)+'.json';
 const validate=(r,id)=>{if(!r||r.schemaVersion!==1||r.mode!=='test'||r.kind!==area||r.orderId!==id||!Number.isSafeInteger(r.revision)||r.revision<1||!/^[a-f0-9]{64}$/.test(r.seal||''))fault('Invalid private extension record.',503);return r;};
 return {
  async read(id){let result;try{result=await readVersionedPrivateBlob(blob,path(id));}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}if(!result)return null;
   const reader=result.stream.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>60000){await reader.cancel();fault('Extension record exceeded its limit.',503);}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
   let r;try{r=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fault('Extension record is unreadable.',503);}return {record:validate(r,id),etag:result.blob.etag};
  },
  async save(id,record,etag){validate(record,id);const raw=JSON.stringify(record);if(Buffer.byteLength(raw)>60000)fault('Extension record exceeded its limit.',503);await blob.put(path(id),raw,{access:'private',contentType:'application/json',addRandomSuffix:false,...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false})});}
 };
}
export function memoryOrderExtensionStore(){const rows=new Map();let n=0;return {async read(id){return rows.has(id)?structuredClone(rows.get(id)):null;},async save(id,r,etag){if((rows.get(id)?.etag||null)!==etag)throw Error('etag_conflict');rows.set(id,{record:structuredClone(r),etag:String(++n)});}};}
