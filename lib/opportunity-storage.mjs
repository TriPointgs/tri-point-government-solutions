import {get,head,put,list} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {namespace} from './storage.mjs';

export function validId(id) {
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new HttpError(400,'Invalid record identifier.');
 return id;
}
const pathname=(kind,id)=>`${namespace()}/${kind}/${validId(id)}.json`;
async function read(kind,id) {
 const path=pathname(kind,id);
 // Metadata ETags come from the storage API; content delivery may transform them.
 // Bracket the uncached read so its body and the write precondition are one version.
 const before=await head(path);
 const result=await get(path,{access:'private',useCache:false});
 if(!result)throw new HttpError(404,'The requested private record was not found.');
 const record=await new Response(result.stream).json();
 const after=await head(path);
 if(!before.etag||before.etag!==after.etag)throw new HttpError(409,'This record changed while loading. Refresh and review it before trying again.');
 return {record,etag:after.etag};
}
async function write(kind,record,etag) {
 try {
  await put(pathname(kind,record.id),JSON.stringify(record),{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag}:{allowOverwrite:false})});
 } catch(error) {
  if(/precondition|already.?exists/i.test(error?.name+' '+error?.message))throw new HttpError(409,'This record changed in another session. Refresh and review it before trying again.');
  throw error;
 }
 return record;
}
async function page(kind,cursor) {
 if(cursor&&(typeof cursor!=='string'||cursor.length>2000))throw new HttpError(400,'Invalid page cursor.');
 const result=await list({prefix:`${namespace()}/${kind}/`,limit:25,...(cursor?{cursor}:{})});
 const records=[];
 for(let i=0;i<result.blobs.length;i+=5){
  const batch=await Promise.all(result.blobs.slice(i,i+5).map(async b=>{const r=await get(b.pathname,{access:'private',useCache:false});return r?new Response(r.stream).json():null;}));
  records.push(...batch.filter(Boolean));
 }
 return {records,cursor:result.hasMore?result.cursor:null,hasMore:result.hasMore};
}
export const opportunityStore={
 readOpportunity:id=>read('opportunities',id),
 saveOpportunity:(record,etag)=>write('opportunities',record,etag),
 pageOpportunities:cursor=>page('opportunities',cursor),
 readProfile:id=>read('applications',id),
 saveProfile:(record,etag)=>write('applications',record,etag),
 pageProfiles:cursor=>page('applications',cursor)
};
