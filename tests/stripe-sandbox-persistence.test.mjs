import test from 'node:test';import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {BlobPreconditionFailedError} from '@vercel/blob';
import {readVersionedPrivateBlob} from '../lib/blob-versioned-read.mjs';
import {createSandboxRunStore,sandboxRunKey,memorySandboxRunStore} from '../lib/stripe-sandbox-checkout.mjs';
import {createStripeSandboxHandler} from '../lib/stripe-sandbox-handler.mjs';
import {sign} from '../lib/security.mjs';
import {sandboxFixture,demoEnv} from './stripe-sandbox-fixture.mjs';
const start=t=>t.service.start(t.owner,t.id,true);
const pid=t=>[...t.sessions.values()][0].payment_intent;
function compressedStore(){
 const rows=new Map(),reads=[],writes=[];
 return {rows,reads,writes,async get(path,options){reads.push(options);const row=rows.get(path);if(!row)return null;const compressed=options.headers?.['Accept-Encoding']!=='identity'&&row.raw.length>1000;return {stream:new Response(row.raw).body,headers:new Headers(compressed?{'content-encoding':'br'}:{}),blob:{etag:compressed?'W/'+row.etag:row.etag}};},async put(path,raw,options){const prior=rows.get(path);if(prior&&(!options.allowOverwrite||options.ifMatch!==prior.etag))throw new BlobPreconditionFailedError();if(!prior&&options.ifMatch)throw new BlobPreconditionFailedError();const etag='"'+createHash('sha256').update(raw).digest('hex')+'"';rows.set(path,{raw,etag});writes.push({path,options});return {etag};}};
}
test('large compressed private JSON reproduces the old ETag conflict; identity reads keep real conditional writes',async()=>{
 const blob=compressedStore(),store=createSandboxRunStore({env:demoEnv,blob}),t=sandboxFixture({store});await start(t);
 const key=sandboxRunKey(demoEnv.TP_STRIPE_TEST_ACCOUNT_ID,t.id),r=await store.read(key);
 await store.save(key,{...r.record,revision:r.record.revision+1,padding:'synthetic'.repeat(1000)},r.etag);
 const path=[...blob.rows.keys()][0],old=await blob.get(path,{access:'private',useCache:false});await old.stream.cancel();
 assert.match(old.blob.etag,/^W\//);
 await assert.rejects(blob.put(path,'{}',{allowOverwrite:true,ifMatch:old.blob.etag}),BlobPreconditionFailedError);
 t.setPaid();const result=await t.service.reconcilePayment(pid(t),true);
 assert.equal(result.sandboxRecordSaved,true);assert.equal(result.capturedTestPaymentVerified,true);
 assert.equal((await t.service.status(t.owner,t.id)).capturedTestPaymentVerified,true);
 assert.equal(t.calls.create,1);assert.equal(result.commercialOrderPaid,false);assert.equal(result.supplierOrderSubmitted,false);
 const current=await store.read(key);assert.equal(current.record.owner,t.owner);
 await assert.rejects(store.save(key,{...current.record,revision:current.record.revision+1},r.etag),BlobPreconditionFailedError);
 for(const w of blob.writes.slice(1)){assert.ok(w.options.ifMatch);assert.equal(w.options.allowOverwrite,true);}
});
test('versioned read refuses weak or compressed response and never changes the returned version token',async()=>{
 for(const [etag,encoding] of [['W/"abc"','identity'],['"abc"','br'],['*','identity'],['','identity'],['a\nb','identity']]){
  const blob={get:async()=>({stream:new Response('{}').body,headers:new Headers({'content-encoding':encoding}),blob:{etag}})};
  await assert.rejects(readVersionedPrivateBlob(blob,'synthetic'),e=>e.status===503);
 }
 const response={stream:new Response('{}').body,headers:new Headers(),blob:{etag:'"exact-tag"'}};let options;
 const got=await readVersionedPrivateBlob({get:async(p,o)=>{options=o;return response;}},'synthetic');
 assert.equal(got.blob.etag,'"exact-tag"');assert.equal(options.headers['Accept-Encoding'],'identity');assert.equal(options.useCache,false);
 assert.equal(await readVersionedPrivateBlob({get:async()=>null},'missing'),null);
});
test('explicit recovery consent is required before even reading Stripe',async()=>{
 const t=sandboxFixture();await start(t);const before={...t.calls};
 await assert.rejects(t.service.reconcilePayment(pid(t),false),e=>e.status===400);assert.deepEqual(t.calls,before);
});
test('recovered payment can be saved repeatedly without creating another session or replacing its owner',async()=>{
 const t=sandboxFixture();await start(t);t.setPaid();const id=pid(t);
 for(let i=0;i<3;i++){const r=await t.service.reconcilePayment(id,true);assert.equal(r.capturedTestPaymentVerified,true);assert.equal(r.marketplaceRecordUpdated,true);assert.equal(r.readOnly,false);assert.equal(r.realSupplierDispatchAllowed,false);}
 assert.equal(t.calls.create,1);const key=sandboxRunKey(demoEnv.TP_STRIPE_TEST_ACCOUNT_ID,t.id);assert.equal((await t.store.read(key)).record.owner,t.owner);
 await assert.rejects(t.service.status(randomUUID(),t.id),e=>e.status===404);
});
test('read-only PaymentIntent confirmation remains read-only after recovery feature is added',async()=>{
 const t=sandboxFixture();await start(t);t.setPaid();const key=sandboxRunKey(demoEnv.TP_STRIPE_TEST_ACCOUNT_ID,t.id),before=await t.store.read(key);
 const result=await t.service.probePayment(pid(t));assert.equal(result.processorCaptureConfirmed,true);assert.equal(result.marketplaceRecordUpdated,false);assert.deepEqual(await t.store.read(key),before);
});
test('recovery refuses a missing original record rather than manufacturing a new payable or test record',async()=>{
 const base=memorySandboxRunStore();let missing=false,saves=0;const store={read:k=>missing?null:base.read(k),save:async(...a)=>{saves++;return base.save(...a);}};
 const t=sandboxFixture({store});await start(t);t.setPaid();const n=saves;missing=true;
 await assert.rejects(t.service.reconcilePayment(pid(t),true),e=>e.status===404);assert.equal(saves,n);
});
test('recovery checks exact payment/session linkage before the first write',async()=>{
 const t=sandboxFixture();await start(t);t.setPaid();const key=sandboxRunKey(demoEnv.TP_STRIPE_TEST_ACCOUNT_ID,t.id),before=await t.store.read(key),read=t.client.checkout.sessions.retrieve;
 t.client.checkout.sessions.retrieve=async(...args)=>({...await read(...args),payment_intent:'pi_DIFFERENT123456'});
 await assert.rejects(t.service.reconcilePayment(pid(t),true),e=>e.status===409);assert.deepEqual(await t.store.read(key),before);
});
test('recovery preserves a previously recorded adverse signed event hold',async()=>{
 const t=sandboxFixture();await start(t);t.setPaid();const e=t.event({type:'charge.refunded'});await t.service.receive(t.verifier.parseEvent(e.raw,e.signature));
 const r=await t.service.reconcilePayment(pid(t),true);assert.equal(r.sandboxRecordSaved,true);assert.equal(r.capturedTestPaymentVerified,false);assert.equal(r.state,'needs-review');assert.equal(r.realSupplierDispatchAllowed,false);
});
test('recovery stores unpaid/refunded/disputed test outcomes without claiming capture',async()=>{
 for(const scenario of ['unpaid','refund','dispute']){const t=sandboxFixture();await start(t);if(scenario!=='unpaid')t.setPaid();if(scenario==='refund')t.setRefund();if(scenario==='dispute')t.setHold();const r=await t.service.reconcilePayment(pid(t),true);assert.equal(r.capturedTestPaymentVerified,false);assert.equal(r.supplierOrderSubmitted,false);}
});
test('uncertain final save is confirmed only by the existing completion token',async()=>{
 const base=memorySandboxRunStore();const store={read:k=>base.read(k),save:async(k,r,e)=>{await base.save(k,r,e);if(r.state==='captured')throw Error('synthetic dropped response');}};
 const t=sandboxFixture({store});await start(t);t.setPaid();const result=await t.service.reconcilePayment(pid(t),true);assert.equal(result.capturedTestPaymentVerified,true);assert.equal(t.calls.create,1);
});
test('permanent storage failures cannot return a saved or approved recovery result',async()=>{
 const base=memorySandboxRunStore();const store={read:k=>base.read(k),save:(k,r,e)=>r.state==='checking'?Promise.reject(Error('synthetic unavailable')):base.save(k,r,e)};
 const t=sandboxFixture({store});await start(t);t.setPaid();await assert.rejects(t.service.reconcilePayment(pid(t),true),e=>e.status===503);assert.equal((await t.service.status(t.owner,t.id)).capturedTestPaymentVerified,false);
});
process.env.NODE_ENV='test';process.env.TP_SESSION_SECRET='synthetic-persistence-route-secret-no-real-value';
async function route({token,origin='http://localhost:3000',input,env={VERCEL_ENV:'preview'}}={}){let calls=0,output='';const handler=createStripeSandboxHandler({env,rate:async()=>{},service:{reconcilePayment:async()=>{calls++;return {sandboxRecordSaved:true,commercialOrderPaid:false};}}}),res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v=''){output=v;}};await handler({method:'POST',url:'/api/commerce?mode=stripe-test',headers:{origin,'content-type':'application/json',cookie:token?'__Host-tp_admin='+token:''},body:input},res);return {status:res.statusCode,calls,output,headers:res.headers};}
test('recovery write is administrator-only, same-origin, schema-limited and forbidden in production',async()=>{
 const token=sign({type:'admin',at:Date.now()}),input={action:'reconcile-payment',paymentId:'pi_SYNTHETIC123456',consent:true};
 const good=await route({token,input});assert.equal(good.status,200);assert.equal(good.calls,1);assert.equal(good.headers['Set-Cookie'],undefined);
 for(const options of [{input},{token:sign({type:'contractor',at:Date.now()}),input},{token,input,origin:'https://evil.test'},{token,input:{...input,paid:true}},{token,input,env:{VERCEL_ENV:'production'}}]){const bad=await route(options);assert.ok(bad.status>=400);assert.equal(bad.calls,0);}
});
