// Only a disposable synthetic namespace is touched; all original orders and payments are excluded.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {get,put,list,head,del} from '@vercel/blob';
import {createCartOrderHistoryStore} from '../lib/cart-order-history.mjs';
const enabled=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&process.env.TP_BLOB_STORAGE_CANARY==='diagnose';
test('preview-only synthetic owner history survives real Blob writes, replays, isolation and pagination',{skip:!enabled,timeout:45000},async()=>{
 const base='preview/cart-order-history-canary/v1/'+randomUUID()+'/',env={VERCEL_ENV:'preview',TP_TEST_ORDER_FINALIZATION_ENABLED:'true',TP_STRIPE_TEST_ACCOUNT_ID:'acct_SYNTHETICONLY001'},paths=new Set();
 const sha=s=>createHash('sha256').update(s).digest('hex');
 const root=p=>{assert.match(p,/^preview\/cart-order-history\/v1\/[a-f0-9]{64}\/$/);return base+sha(p)+'/';};
 const split=p=>{assert.match(p,/^preview\/cart-order-history\/v1\/[a-f0-9]{64}\/[0-9a-f-]{36}\.json$/);const i=p.lastIndexOf('/')+1;return {prefix:p.slice(0,i),name:p.slice(i)};};
 const physical=p=>{const v=split(p);return root(v.prefix)+v.name;};
 const blob={get:(p,o)=>get(physical(p),o),put:async(p,data,o)=>{const path=physical(p);paths.add(path);return put(path,data,o);},list:async({prefix,...opts})=>{const r=await list({prefix:root(prefix),...opts});return {...r,blobs:r.blobs.map(b=>({...b,pathname:prefix+b.pathname.slice(root(prefix).length)}))};}};
 const report={realBlob:true,syntheticOnly:true,save:false,idempotent:false,ownerIsolated:false,pageFirst:false,pageSecond:false,cleanup:false};
 try{const h=createCartOrderHistoryStore({env,blob}),owner=randomUUID(),other=randomUUID();
  const orders=Array.from({length:11},(_,i)=>({id:randomUUID(),reviewId:randomUUID(),createdAt:new Date(Date.parse('2026-10-25T01:00:00Z')+i*1000).toISOString()}));
  for(const o of orders)await h.save(owner,o);report.save=paths.size===11;
  report.idempotent=(await h.save(owner,orders[0])).duplicate===true;
  report.ownerIsolated=(await h.page(other)).records.length===0;
  const first=await h.page(owner);report.pageFirst=first.records.length===10&&first.hasMore===true&&typeof first.cursor==='string';
  const second=await h.page(owner,first.cursor);report.pageSecond=second.records.length===1&&second.hasMore===false&&new Set([...first.records,...second.records].map(r=>r.orderId)).size===11;
 }finally{let clean=true;for(const path of paths){try{const x=await head(path);await del(path,{ifMatch:x.etag});if(await get(path,{access:'private',useCache:false}))clean=false;}catch{clean=false;}}report.cleanup=clean;console.info('TP_PRIVATE_ORDER_HISTORY_BLOB',JSON.stringify(report));}
 for(const k of ['save','idempotent','ownerIsolated','pageFirst','pageSecond','cleanup'])assert.equal(report[k],true,k);
});
