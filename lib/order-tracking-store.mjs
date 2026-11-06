import {readVersionedPrivateBlob} from './blob-versioned-read.mjs';
import {get,put,list,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
export function trackingId(id){if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw new HttpError(400,'Invalid supplier tracking record.');return id;}
export const isTrackingConflict=e=>/precondition|already.?exists|etag_conflict/i.test((e?.name||'')+' '+(e?.message||''));
export function createTrackingStore({env=process.env,scope,blob={get,put,list}}={}){
 const prefix='preview/supplier-order-tracking/v1/'+trackingId(scope)+'/';
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Supplier tracking is still a private preview.');};
 const path=id=>prefix+trackingId(id)+'.json';
 const store={
  async read(id){guard();let result;try{result=await readVersionedPrivateBlob(blob,path(id));}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}if(!result)return null;
   if(!result.stream||!result.blob?.etag)throw new HttpError(503,'Tracking storage could not confirm its current version.');
   const reader=result.stream.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2500000){await reader.cancel();throw new HttpError(503,'Tracking record exceeded its size limit.');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
   let record;try{record=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(503,'Tracking record is unreadable.');}
   if(record.schemaVersion!==1||record.mode!=='preview'||record.scope!==scope||record.id!==id||!Number.isSafeInteger(record.revision))throw new HttpError(503,'Unexpected supplier tracking record.');return {record,etag:result.blob.etag};
  },
  async save(record,etag){guard();if(record.schemaVersion!==1||record.mode!=='preview'||record.scope!==scope||!Number.isSafeInteger(record.revision)||record.revision<0||!Array.isArray(record.events)||record.events.length>100)throw new HttpError(400,'Invalid tracking record.');const raw=JSON.stringify(record);if(Buffer.byteLength(raw)>2500000)throw new HttpError(400,'Tracking record is too large.');await blob.put(path(record.id),raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false})});},
  async page(cursor){guard();if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>2048))throw new HttpError(400,'Invalid tracking cursor.');const result=await blob.list({prefix,limit:20,...(cursor?{cursor}:{})}),records=[];for(let i=0;i<result.blobs.length;i+=4){const batch=await Promise.all(result.blobs.slice(i,i+4).map(x=>{const name=x.pathname;if(!name.startsWith(prefix)||!name.endsWith('.json'))throw new HttpError(503,'Unexpected tracking file.');return store.read(name.slice(prefix.length,-5));}));records.push(...batch.filter(Boolean).map(x=>x.record));}return {records,hasMore:result.hasMore===true,cursor:result.hasMore?result.cursor:null};}
 };return store;
}
export function memoryTrackingStore(){const rows=new Map();let counter=0;return {async read(id){trackingId(id);return rows.has(id)?structuredClone(rows.get(id)):null;},async save(record,etag){trackingId(record.id);const old=rows.get(record.id);if((old?.etag||null)!==etag)throw Error('etag_conflict');rows.set(record.id,{record:structuredClone(record),etag:String(++counter)});},async page(cursor){const start=Number(cursor||0),all=[...rows.values()].map(x=>structuredClone(x.record)),records=all.slice(start,start+20);return {records,hasMore:start+20<all.length,cursor:start+20<all.length?String(start+20):null};}};}
