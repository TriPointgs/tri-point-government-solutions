import {get,head,put,list,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {contactId} from './contact-model.mjs';
export function createContactStore({env=process.env}={}){
 const prefix=(env.VERCEL_ENV==='production'?'production':'preview')+'/contact-inquiries/';
 const path=id=>prefix+contactId(id)+'.json';
 async function read(id){const p=path(id);try{const before=await head(p),r=await get(p,{access:'private',useCache:false});if(!r)throw new HttpError(404,'Inquiry not found.');const record=await new Response(r.stream).json(),after=await head(p);if(!before.etag||before.etag!==after.etag)throw new HttpError(409,'Inquiry changed during retrieval. Refresh and retry.');return {record,etag:after.etag};}catch(e){if(e instanceof BlobNotFoundError)throw new HttpError(404,'Inquiry not found.');throw e;}}
 async function save(record,etag){try{await put(path(record.id),JSON.stringify(record),{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}catch(e){if(/already.?exists|precondition/i.test((e.name||'')+' '+e.message))throw new HttpError(409,'Inquiry changed. Refresh before retrying.');throw e;}return record;}
 return {read,save,async create(record){try{await save(record);return {created:true,record};}catch(e){if(e.status!==409)throw e;return {created:false,...await read(record.id)};}},async page(cursor){if(cursor&&(typeof cursor!=='string'||cursor.length>2000))throw new HttpError(400,'Invalid inquiry page.');const r=await list({prefix,limit:25,...(cursor?{cursor}:{})});const records=await Promise.all(r.blobs.map(async b=>(await read(b.pathname.slice(prefix.length,-5))).record));return {records,hasMore:r.hasMore===true,cursor:r.hasMore?r.cursor:null};}};
}
