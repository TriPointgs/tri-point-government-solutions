// Used only by the loopback synthetic preview. Never imported by a production route.
const entries=new Map();let sequence=0;
export class BlobNotFoundError extends Error {}
export async function put(path,body,options){
 const current=entries.get(path);
 if((options.ifMatch&&current?.etag!==options.ifMatch)||(!options.ifMatch&&!options.allowOverwrite&&current)){
  const error=new Error('Precondition failed or already exists');error.name='BlobPreconditionFailedError';throw error;
 }
 const item={body:String(body),etag:String(++sequence)};entries.set(path,item);return {pathname:path,url:path,etag:item.etag};
}
export async function get(path){const item=entries.get(path);return item?{stream:new Response(item.body).body,blob:{etag:item.etag}}:null;}
export async function head(path){const item=entries.get(path);if(!item)throw new BlobNotFoundError('Blob not found');return {etag:item.etag};}
export async function list({prefix,limit=25,cursor}){const keys=[...entries.keys()].filter(x=>x.startsWith(prefix)).sort();const offset=Number(cursor||0);const selected=keys.slice(offset,offset+limit);return {blobs:selected.map(pathname=>({pathname,url:pathname,etag:entries.get(pathname).etag})),hasMore:offset+limit<keys.length,cursor:String(offset+limit)};}
export async function del(path){entries.delete(path);}
