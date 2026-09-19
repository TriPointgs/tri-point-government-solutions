import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {body} from '../lib/security.mjs';
import {namespace} from '../lib/storage.mjs';
import {validId} from '../lib/opportunity-storage.mjs';
import {deliveryConfiguration,deliverApprovedDraft} from '../lib/outreach-delivery.mjs';

function storageScenario(mode) {
 const storageFile=pathToFileURL(resolve('lib/opportunity-storage.mjs')).href;
 const mock=Buffer.from(`
  let headCount=0;
  const id='11111111-1111-4111-8111-111111111111';
  export class BlobNotFoundError extends Error { constructor(){super('Blob not found');this.name='BlobNotFoundError';} }
  export async function head(){
   headCount++;
   if(${JSON.stringify(mode)}==='notfound') throw new BlobNotFoundError();
   if(${JSON.stringify(mode)}==='missing') return {etag:''};
   if(${JSON.stringify(mode)}==='mismatch'&&headCount>1) return {etag:'metadata-v2'};
   return {etag:'metadata-v1'};
  }
  export async function get(){return {stream:new Response(JSON.stringify({id,revision:1})).body,blob:{etag:'W/"content-v1"'}};}
  export async function put(path,body,options){
   if(${JSON.stringify(mode)}==='concurrent') { const e=new Error('Precondition failed: ETag mismatch.'); e.name='BlobPreconditionFailedError'; throw e; }
   return {pathname:path,etag:'metadata-v2'};
  }
  export async function del(){}
  export async function list(){return {blobs:[],cursor:null,hasMore:false};}
 `,'utf8').toString('base64');
 const code=`
  import {registerHooks} from 'node:module';
  registerHooks({resolve(specifier,context,next){
   if(specifier==='@vercel/blob') return {url:'data:text/javascript;base64,${mock}',shortCircuit:true};
   return next(specifier,context);
  }});
  const {opportunityStore}=await import(${JSON.stringify(storageFile)});
  const id='11111111-1111-4111-8111-111111111111';
  try {
   if(${JSON.stringify(mode)}==='concurrent') {
    const read=await opportunityStore.readOpportunity(id);
    await opportunityStore.saveOpportunity(read.record,read.etag);
   } else {
    const result=await opportunityStore.readOpportunity(id);
    console.log(JSON.stringify({etag:result.etag}));
   }
  } catch(error) {
   console.log(JSON.stringify({status:error.status||null,message:error.message}));
  }
 `;
 const result=spawnSync(process.execPath,['--input-type=module','--eval',code],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}

test('preview and production storage namespaces cannot be selected by request data',()=>{
 const previous=process.env.VERCEL_ENV;
 try{delete process.env.VERCEL_ENV;assert.equal(namespace(),'preview');process.env.VERCEL_ENV='preview';assert.equal(namespace(),'preview');process.env.VERCEL_ENV='production';assert.equal(namespace(),'production');}
 finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
test('storage IDs reject paths and non UUID identifiers',()=>{
 for(const id of ['../production/applications','https://example.invalid','id',null,{},'11111111-1111-1111-1111-111111111111/extra'])assert.throws(()=>validId(id));
 assert.equal(validId('11111111-1111-4111-8111-111111111111'),'11111111-1111-4111-8111-111111111111');
});
test('conditional reads use storage metadata ETag when content ETag is transformed',()=>{
 const result=storageScenario('transformed');
 assert.deepEqual(result,{etag:'metadata-v1'});
});
test('conditional read rejects a version change during the body read',()=>{
 const result=storageScenario('mismatch');
 assert.equal(result.status,409);
 assert.match(result.message,/changed while loading/);
});
test('conditional read rejects missing metadata ETags',()=>{
 const result=storageScenario('missing');
 assert.equal(result.status,409);
 assert.match(result.message,/changed while loading/);
});
test('missing records from metadata lookup remain application-level 404s',()=>{
 const result=storageScenario('notfound');
 assert.equal(result.status,404);
 assert.match(result.message,/private record was not found/);
});
test('conditional write still rejects a concurrent change after metadata read',()=>{
 const result=storageScenario('concurrent');
 assert.equal(result.status,409);
 assert.match(result.message,/changed in another session/);
});
test('larger opportunity bodies do not loosen the existing signup limit',async()=>{
 const req={headers:{'content-type':'application/json'},body:{review:'x'.repeat(20000)}};
 await assert.rejects(()=>body(req));assert.ok((await body(req,131072)).review);
 await assert.rejects(()=>body({...req,body:{review:'x'.repeat(131073)}},131072));
});
test('real transport fails closed in preview even with configured production-looking flags',async()=>{
 const names=['VERCEL_ENV','TP_OUTREACH_ENABLED','RESEND_API_KEY','TP_OUTREACH_FROM'];const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{process.env.VERCEL_ENV='preview';process.env.TP_OUTREACH_ENABLED='true';process.env.RESEND_API_KEY='synthetic-not-a-key';process.env.TP_OUTREACH_FROM='synthetic@example.invalid';assert.deepEqual(deliveryConfiguration(),{preview:true,enabled:false});await assert.rejects(()=>deliverApprovedDraft({to:'synthetic@example.invalid',subject:'Synthetic',body:'Never sent',id:'synthetic'}),e=>e.status===503);}
 finally{for(const k of names)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
