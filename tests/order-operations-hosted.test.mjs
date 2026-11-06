// Explicit branch-only real Blob test. All orders/payments/supplier data are synthetic.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {get,put,head,del} from '@vercel/blob';
import {createOrderExtensionStore} from '../lib/order-extension-store.mjs';
import {operationsFixture} from './order-operations-fixture.mjs';
import {env as baseEnv} from './payment-first-fixture.mjs';
const enabled=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&process.env.TP_BLOB_STORAGE_CANARY==='diagnose';
test('buyer capability lifecycle and supplier handoff persist on isolated real private storage',{skip:!enabled,timeout:60000},async()=>{
 const root='preview/order-operations-canary/v1/'+randomUUID()+'/',paths=new Set(),env={...baseEnv,VERCEL_ENV:'preview'};
 const location=p=>{assert.match(p,/^preview\/order-extensions\/v1\/[a-f0-9]{64}\/(buyer-access|supplier-handoff)\/[0-9a-f-]{36}\.json$/);return root+createHash('sha256').update(p).digest('hex')+'.json';};
 const blob={get:(p,o)=>get(location(p),o),put:async(p,b,o)=>{const path=location(p);paths.add(path);return put(path,b,o);}};
 const report={realBlob:true,syntheticProviders:true,invitationSaved:false,singleUse:false,buyerReadBack:false,revoked:false,supplierPrepared:false,supplierMatched:false,staleTrackingHeld:false,cleanup:false};
 try{
  const buyerStore=createOrderExtensionStore({area:'buyer-access',env,blob}),supplierStore=createOrderExtensionStore({area:'supplier-handoff',env,blob}),f=await operationsFixture({buyerStore,supplierStore});await f.pay();
  const invitation=await f.buyer.issue({orderId:f.order.id,expectedRevision:0,consent:true});report.invitationSaved=(await buyerStore.read(f.order.id)).record.state==='invited';const session=await f.buyer.redeem(invitation.inviteToken);await assert.rejects(f.buyer.redeem(invitation.inviteToken),e=>e.status===401);report.singleUse=true;
  const input={orderId:f.order.id,requestId:randomUUID(),expectedRevision:0,consent:true};const prepared=await f.supplier.prepare(input);report.supplierPrepared=prepared.preflightPassed&&(await supplierStore.read(f.order.id)).record.state==='prepared';
  const matched=await f.supplier.reconcile({...input,requestId:randomUUID(),expectedRevision:prepared.revision});report.supplierMatched=matched.state==='matched'&&(await supplierStore.read(f.order.id)).record.observation.matched===true;
  const status=await f.buyer.read(session.sessionToken);report.buyerReadBack=status.readOnly&&status.payment.state==='capture-observed'&&status.fulfillment.tracking.length===1&&status.supplierOrderSubmitted===false;
  f.t.advance(900001);report.staleTrackingHeld=(await f.buyer.read(session.sessionToken)).fulfillment.tracking.length===0;
  const admin=await f.buyer.administration(f.order.id);await f.buyer.revoke({orderId:f.order.id,expectedRevision:admin.revision});await assert.rejects(f.buyer.read(session.sessionToken),e=>e.status===401);report.revoked=(await buyerStore.read(f.order.id)).record.state==='revoked';
 }finally{let clean=true;for(const path of paths){try{await del(path,{ifMatch:(await head(path)).etag});if(await get(path,{access:'private',useCache:false}))clean=false;}catch{try{if(await get(path,{access:'private',useCache:false}))clean=false;}catch{clean=false;}}}report.cleanup=clean;console.info('TP_ORDER_OPERATIONS_CANARY',JSON.stringify(report));}
 for(const key of ['invitationSaved','singleUse','buyerReadBack','revoked','supplierPrepared','supplierMatched','staleTrackingHeld','cleanup'])assert.equal(report[key],true,key);
});
