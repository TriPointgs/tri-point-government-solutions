// Atomic preview-only image budgets; unrelated login, cart and production limits are unchanged.
import {get,head,put,BlobNotFoundError} from '@vercel/blob';
import {digest} from './security.mjs';import {HttpError} from './model.mjs';
export const IMAGE_WINDOW_MS=900000;
export const IMAGE_PROVIDER_LIMIT=60; // application safety cap, not an Icecat subscription allowance
export const IMAGE_READ_LIMIT=240;
export function createImageBudgetStore({blob={get,head,put}}={}){
 const path=key=>{if(!/^[a-f0-9]{64}$/.test(key))throw new HttpError(400,'Invalid image budget key.');return 'preview/image-budgets/v2/'+key+'.json';};
 return {async read(key){try{const before=await blob.head(path(key)),r=await blob.get(path(key),{access:'private',useCache:false});if(!r)return {count:0,bucket:null,etag:null};const raw=await new Response(r.stream).text();if(Buffer.byteLength(raw)>300)throw Error('Invalid budget');const value=JSON.parse(raw);if(!Number.isSafeInteger(value.count)||value.count<0||!Number.isSafeInteger(value.bucket))throw Error('Invalid budget');return {count:value.count,bucket:value.bucket,etag:before.etag};}catch(e){if(e instanceof BlobNotFoundError)return {count:0,bucket:null,etag:null};throw e;}},
  async save(key,count,etag,bucket){await blob.put(path(key),JSON.stringify({count,bucket}),{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false})});}};
}
export function createImageRequestBudget({env=process.env,store=createImageBudgetStore(),clock=()=>Date.now(),keyHash=digest}={}){
 return async(req,action)=>{
  if(env.VERCEL_ENV==='production')throw new HttpError(503,'Image preview is not released.');
  if(!['read','provider'].includes(action))throw new HttpError(400,'Invalid image budget action.');
  const time=clock(),bucket=Math.floor(time/IMAGE_WINDOW_MS),ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const key=keyHash('image-budget-v2:'+action+':'+(action==='provider'?'account':ip));
  const max=action==='provider'?IMAGE_PROVIDER_LIMIT:IMAGE_READ_LIMIT;
  for(let attempt=0;attempt<6;attempt++){
   try{const row=await store.read(key),etag=row.etag,count=row.bucket===bucket?row.count:0;if(row.bucket!==null&&row.bucket>bucket)throw Error('Invalid future budget');if(count>=max){const e=new HttpError(429,'Photo requests are temporarily paused. Existing cached photos remain available; new lookups resume after the request window resets.');e.code='image_request_budget';e.retryAfter=Math.max(1,Math.ceil(((bucket+1)*IMAGE_WINDOW_MS-time)/1000));throw e;}await store.save(key,count+1,etag,bucket);return;}
   catch(e){if(e instanceof HttpError)throw e;if(/precondition|already.?exists/i.test((e.name||'')+' '+e.message))continue;const safe=new HttpError(503,'Photo service is temporarily unavailable. Please retry.');safe.code='image_service_unavailable';throw safe;}
  }
  const e=new HttpError(503,'Photo service is busy. Please retry.');e.code='image_service_busy';throw e;
 };
}
