// Keep the response representation identical to the stored object for conditional writes.
// Never strip W/, replace an ETag with head() metadata, or remove ifMatch on retries.
import {HttpError} from './model.mjs';
export async function readVersionedPrivateBlob(blob,path){
 const result=await blob.get(path,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
 if(!result)return null;
 const etag=result.blob?.etag,encoding=result.headers?.get?.('content-encoding');
 if((encoding&&encoding!=='identity')||typeof etag!=='string'||!etag||etag.length>512||etag.startsWith('W/')||etag==='*'||/[\r\n,]/.test(etag)){
  try{await result.stream?.cancel();}catch{}
  throw new HttpError(503,'A strong storage version could not be read. No record was overwritten.');
 }
 return result;
}
