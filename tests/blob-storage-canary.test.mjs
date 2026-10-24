import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {put,get,head,del,BlobPreconditionFailedError} from '@vercel/blob';
const enabled=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&process.env.TP_BLOB_STORAGE_CANARY==='diagnose';
test('explicit preview-only synthetic Blob version diagnostic',{skip:!enabled,timeout:45000},async()=>{
 const path='preview/blob-cas-canary/v1/'+randomUUID()+'.json';
 const opts={access:'private',addRandomSuffix:false,contentType:'application/json'};
 const report={syntheticOnly:true,defaultReadMatchesUpload:false,identityReadMatchesUpload:false,headMatchesUpload:false,defaultCAS:'not-run',identityCAS:'not-run',headCAS:'not-run',staleWriteRejected:false,cleanup:false};
 const shape=s=>typeof s!=='string'?'missing':s.startsWith('W/')?'weak':s.startsWith('"')?'quoted':'bare';
 const read=async headers=>{const r=await get(path,{access:'private',useCache:false,...(headers?{headers}:{})});if(!r?.stream)throw Error('Canary read unavailable');const value=await new Response(r.stream).text();return {tag:r.blob.etag,value,encoding:r.headers?.get('content-encoding')||'identity'};};
 const write=async(tag,label)=>{try{await put(path,JSON.stringify({kind:'synthetic-storage-canary',stage:label}),{...opts,allowOverwrite:true,ifMatch:tag});report[label]='passed';return true;}catch(e){report[label]=e instanceof BlobPreconditionFailedError?'precondition':'other-error';return false;}};
 let created=false;
 try{
  const first=await put(path,JSON.stringify({kind:'synthetic-storage-canary',stage:'initial',padding:'synthetic-only-'.repeat(600)}),{...opts,allowOverwrite:false});created=true;
  const a=await read(),b=await read({'Accept-Encoding':'identity'}),h=await head(path);
  Object.assign(report,{defaultReadMatchesUpload:a.tag===first.etag,identityReadMatchesUpload:b.tag===first.etag,headMatchesUpload:h.etag===first.etag,uploadTagShape:shape(first.etag),defaultTagShape:shape(a.tag),identityTagShape:shape(b.tag),defaultEncoding:a.encoding,identityEncoding:b.encoding});
  let ok=await write(a.tag,'defaultCAS');
  if(!ok)ok=await write((await read({'Accept-Encoding':'identity'})).tag,'identityCAS');
  if(!ok)ok=await write((await head(path)).etag,'headCAS');
  if(ok){try{await put(path,'{"kind":"synthetic-storage-canary","stage":"stale"}',{...opts,allowOverwrite:true,ifMatch:first.etag});}catch(e){report.staleWriteRejected=e instanceof BlobPreconditionFailedError;}}
 }finally{
  if(created){try{const current=await head(path);await del(path,{ifMatch:current.etag});report.cleanup=(await get(path,{access:'private',useCache:false}))===null;}catch{report.cleanup=false;}}
  console.info('TP_BLOB_CANARY_SAFE_RESULT',JSON.stringify(report));
 }
 assert.equal(report.cleanup,true,'Synthetic canary cleanup must succeed');
 assert.equal(report.staleWriteRejected,true,'Stale conditional writes must be rejected');
});
