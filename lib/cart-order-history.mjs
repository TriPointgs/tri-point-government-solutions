// Owner-scoped PRIVATE preview test-order index. No buyer details or payments.
// A pointer is never itself proof of an order; callers must reopen the authoritative order.
import {createHash} from 'node:crypto';
import {get,put,list} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {cartId} from './shop-cart-store.mjs';
import {readVersionedPrivateBlob} from './blob-versioned-read.mjs';
const problem=(m,status=503)=>{throw new HttpError(status,m);};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const conflict=e=>/precondition|already.?exists|etag_conflict/i.test((e?.name||'')+' '+(e?.message||''));
const maxCursor=2048;
const verifyCursor=v=>{if(v===null||v===undefined||v==='')return null;if(typeof v!=='string'||v.length>maxCursor||/[\x00-\x1f\x7f]/.test(v))problem('Invalid order-history cursor.',400);return v;};
export function createCartOrderHistoryStore({env=process.env,blob={get,put,list}}={}){
 const guard=()=>{if(env.VERCEL_ENV!=='preview'||env.TP_TEST_ORDER_FINALIZATION_ENABLED!=='true'||!/^acct_[A-Za-z0-9]{4,100}$/.test(env.TP_STRIPE_TEST_ACCOUNT_ID||''))problem('Private order history is not enabled.');};
 const root=owner=>{guard();cartId(owner);return 'preview/cart-order-history/v1/'+digest(['owner-test-history',env.TP_STRIPE_TEST_ACCOUNT_ID,owner])+'/';};
 const at=(owner,id)=>root(owner)+cartId(id)+'.json';
 const valid=(r,owner,id)=>r?.schemaVersion===1&&r?.kind==='private-test-order-pointer'&&r?.mode==='test'&&r?.orderId===id&&r?.reviewId&&cartId(r.reviewId)===r.reviewId&&r?.ownerScope===digest(['owner-test-history',env.TP_STRIPE_TEST_ACCOUNT_ID,owner])&&Number.isFinite(Date.parse(r.createdAt));
 async function load(owner,id){let result;try{result=await readVersionedPrivateBlob(blob,at(owner,id));}catch(e){if(e?.name==='BlobNotFoundError')return null;throw e;}if(!result)return null;const data=await new Response(result.stream).text();if(Buffer.byteLength(data)>2048)problem('Order-history pointer is invalid.');let parsed;try{parsed=JSON.parse(data);}catch{problem('Order-history pointer is unreadable.');}if(!valid(parsed,owner,id))problem('Order-history pointer does not match its owner and order.');return parsed;}
 return {
  async save(owner,{id,reviewId,createdAt}){guard();cartId(owner);cartId(id);cartId(reviewId);if(!Number.isFinite(Date.parse(createdAt)))problem('Invalid immutable order creation date.',400);
   const record={schemaVersion:1,kind:'private-test-order-pointer',mode:'test',ownerScope:digest(['owner-test-history',env.TP_STRIPE_TEST_ACCOUNT_ID,owner]),orderId:id,reviewId,createdAt};
   try{await blob.put(at(owner,id),JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return {indexed:true,duplicate:false};}
   catch(e){if(!conflict(e))throw e;const prior=await load(owner,id);if(JSON.stringify(prior)!==JSON.stringify(record))problem('An existing order-history index differs from this immutable order.',409);return {indexed:true,duplicate:true};}
  },
  async page(owner,cursor){const prefix=root(owner),next=verifyCursor(cursor),result=await blob.list({prefix,limit:10,...(next?{cursor:next}:{})});
   if(!result||!Array.isArray(result.blobs)||result.blobs.length>10||typeof result.hasMore!=='boolean')problem('Order-history listing cannot be verified.');
   const seen=new Set(),records=[];
   for(const entry of result.blobs){if(typeof entry.pathname!=='string'||!entry.pathname.startsWith(prefix))problem('Unexpected order-history path.');const rest=entry.pathname.slice(prefix.length);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/.test(rest))problem('Invalid indexed order identifier.');const id=rest.slice(0,-5);if(seen.has(id))problem('Duplicate order-history entry.');seen.add(id);const pointer=await load(owner,id);if(!pointer)problem('Indexed order was deleted unexpectedly.');records.push({orderId:id,reviewId:pointer.reviewId,createdAt:pointer.createdAt});}
   if(result.hasMore&&(!result.cursor||result.cursor===next))problem('Order history has an invalid continuation.');
   return {records,hasMore:result.hasMore,cursor:result.hasMore?result.cursor:null};
  }
 };
}
export function memoryCartOrderHistoryStore(){const rows=new Map();return {async save(owner,{id,reviewId,createdAt}){cartId(owner);cartId(id);cartId(reviewId);const k=owner+':'+id,record={orderId:id,reviewId,createdAt};if(rows.has(k)){if(JSON.stringify(rows.get(k))!==JSON.stringify(record))problem('Immutable order pointer conflict.',409);return {indexed:true,duplicate:true};}rows.set(k,structuredClone(record));return {indexed:true,duplicate:false};},async page(owner,cursor){cartId(owner);if(cursor!==undefined&&cursor!==null&&!/^\d{1,6}$/.test(cursor))problem('Invalid order-history cursor.',400);const n=Number(cursor||0),all=[...rows.entries()].filter(([k])=>k.startsWith(owner+':')).map(([,v])=>structuredClone(v)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.orderId.localeCompare(b.orderId));return {records:all.slice(n,n+10),hasMore:n+10<all.length,cursor:n+10<all.length?String(n+10):null};}};}
