import {get,head,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {validProductId} from './product-controls-model.mjs';
import {blankResearch} from './research-report.mjs';
export function createResearchStore({env=process.env,blob={get,head,put}}={}){
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Research reports are preview-only.');};
 const path=id=>'preview/product-research/'+validProductId(id)+'.json';
 return {async read(product){guard();let before;try{before=await blob.head(path(product.id));}catch(e){if(e instanceof BlobNotFoundError)return {record:blankResearch(product),etag:null};throw e;}
  const res=await blob.get(path(product.id),{access:'private',useCache:false});if(!res)throw new HttpError(409,'Research changed while loading.');
  const raw=await new Response(res.stream).text();if(Buffer.byteLength(raw)>160000)throw new HttpError(503,'Unexpected research record size.');
  const record=JSON.parse(raw),after=await blob.head(path(product.id));
  if(!before.etag||before.etag!==after.etag)throw new HttpError(409,'Research changed while loading.');
  if(record.schemaVersion!==1||record.productId!==product.id||record.mode!=='preview'||!record.runs||Object.keys(record.runs).some(k=>!['shopping','exact_web'].includes(k))||Object.values(record.runs).some(r=>!r||!Array.isArray(r.rows)||r.rows.length>40))throw new HttpError(503,'Unexpected research record.');
  return {record,etag:after.etag};},
  async save(record,etag){guard();const raw=JSON.stringify(record);if(record.mode!=='preview'||Buffer.byteLength(raw)>160000)throw new HttpError(400,'Invalid research record.');
   try{await blob.put(path(record.productId),raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}catch(e){if(/precondition|already.?exists/i.test((e.name||'')+' '+e.message))throw new HttpError(409,'Research changed in another session.');throw e;}}
 };
}
export function memoryResearchStore(){const records=new Map();return {async read(p){const r=records.get(p.id);return {record:r?structuredClone(r):blankResearch(p),etag:r?String(r.revision):null};},async save(r,e){const old=records.get(r.productId);if(e!==(old?String(old.revision):null))throw new HttpError(409,'Research conflict.');records.set(r.productId,structuredClone(r));}};}
