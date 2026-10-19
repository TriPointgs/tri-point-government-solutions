import {get,head,put,list,BlobNotFoundError} from '@vercel/blob';
import {OrderError} from './commerce-order.mjs';
// This preview repository NEVER addresses a production order collection.
const idCheck=id=>{if(typeof id!=='string'||!/^SIM-[A-Za-z0-9-]{8,70}$/.test(id))throw new OrderError(400,'Invalid simulation ID.');return id;};
export function createPreviewOrderRepository(env=process.env){
 const guard=()=>{if(env.VERCEL_ENV==='production'||env.TP_ORDER_LAB_ENABLED!=='true'||!env.BLOB_READ_WRITE_TOKEN)throw new OrderError(503,'Preview order storage is not enabled. Use the browser-only simulation.');};
 const path=id=>'preview/commerce-order-lab/'+idCheck(id)+'.json';
 const read=async id=>{guard();const p=path(id);try{const before=await head(p),r=await get(p,{access:'private',useCache:false});if(!r)throw new OrderError(404,'Simulation not found.');const order=await new Response(r.stream).json(),after=await head(p);if(!before.etag||before.etag!==after.etag)throw new OrderError(409,'Order changed during retrieval.');if(order.mode!=='simulation'||order.id!==id)throw new OrderError(409,'Unexpected stored record.');return {order,etag:after.etag};}catch(e){if(e instanceof BlobNotFoundError)throw new OrderError(404,'Simulation not found.');throw e;}};
 return {read,
  async create(order){guard();if(order.mode!=='simulation')throw new OrderError(403,'Simulation required.');try{await put(path(order.id),JSON.stringify(order),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return {created:true,order};}catch(e){if(/already.?exists|precondition/i.test((e.name||'')+' '+e.message))return {created:false,...await read(order.id)};throw e;}},
  async save(order,etag){guard();if(order.mode!=='simulation'||!etag)throw new OrderError(403,'Versioned simulation write required.');try{await put(path(order.id),JSON.stringify(order),{access:'private',addRandomSuffix:false,ifMatch:etag,contentType:'application/json'});}catch(e){if(/already.?exists|precondition/i.test((e.name||'')+' '+e.message))throw new OrderError(409,'Concurrent order update. Refresh before retrying.');throw e;}},
  async list(cursor){guard();if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>2000))throw new OrderError(400,'Invalid page cursor.');const r=await list({prefix:'preview/commerce-order-lab/',limit:25,...(cursor?{cursor}:{})});const records=await Promise.all(r.blobs.map(async b=>(await read(b.pathname.split('/').at(-1).replace(/\.json$/,''))).order));return {records,hasMore:r.hasMore,cursor:r.cursor??null};}
 };
}
