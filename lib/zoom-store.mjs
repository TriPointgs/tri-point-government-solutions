import {get,head,put,list,BlobNotFoundError} from '@vercel/blob';
import {namespace} from './storage.mjs';
import {validId} from './opportunity-storage.mjs';
import {HttpError} from './model.mjs';
const collision=e=>/precondition|already.?exists/i.test((e?.name||'')+' '+(e?.message||''));
const location=(kind,id)=>`${namespace()}/${kind}/${id}.json`;
export function zoomLeadPath(id){return location('zoom-leads',validId(id));}
async function readPath(path,optional=false){
 let before;try{before=await head(path);}catch(e){if(e instanceof BlobNotFoundError){if(optional)return null;throw new HttpError(404,'The private sales record was not found.');}throw e;}
 const r=await get(path,{access:'private',useCache:false});if(!r){if(optional)return null;throw new HttpError(404,'The private sales record was not found.');}
 const record=await new Response(r.stream).json(),after=await head(path);
 if(!before.etag||before.etag!==after.etag)throw new HttpError(409,'This sales record changed while loading. Refresh before retrying.');
 return {record,etag:after.etag};
}
async function savePath(path,record,etag){
 try{await put(path,JSON.stringify(record),{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag}:{allowOverwrite:false})});}
 catch(e){if(collision(e))throw new HttpError(409,'This sales record changed in another session. Refresh before retrying.');throw e;}
 return record;
}
async function page(cursor){
 if(cursor&&(typeof cursor!=='string'||cursor.length>2000))throw new HttpError(400,'Invalid lead page cursor.');
 const r=await list({prefix:location('zoom-leads','').replace('/.json','/'),limit:25,...(cursor?{cursor}:{})});
 const records=[];for(let i=0;i<r.blobs.length;i+=5){const batch=await Promise.all(r.blobs.slice(i,i+5).map(async b=>{const value=await get(b.pathname,{access:'private',useCache:false});return value?new Response(value.stream).json():null;}));records.push(...batch.filter(Boolean));}
 return {records,cursor:r.hasMore?r.cursor:null,hasMore:r.hasMore};
}
export const zoomStore={
 read:id=>readPath(zoomLeadPath(id)),
 save:(record,etag)=>savePath(zoomLeadPath(record.id),record,etag),
 async create(record){try{await savePath(zoomLeadPath(record.id),record);return {created:true,record};}catch(e){if(e.status!==409)throw e;return {created:false,...await readPath(zoomLeadPath(record.id))};}},
 page,
 readRun:day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new HttpError(400,'Invalid reminder date.');return readPath(location('zoom-reminder-runs',day),true);},
 saveRun:(record,etag)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(record.day))throw new HttpError(400,'Invalid reminder date.');return savePath(location('zoom-reminder-runs',record.day),record,etag);}
};
