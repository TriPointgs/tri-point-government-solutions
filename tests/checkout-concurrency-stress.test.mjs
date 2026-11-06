import test from 'node:test';import assert from 'node:assert/strict';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {paymentRecordKey} from '../lib/payment-verification-store.mjs';
const opened=async()=>{const t=await cartPaymentFixture(),o=await t.finalize();await t.service.open(t.owner,{orderId:o.id,testConsent:true});t.paid();return {t,o};};
test('25 repeated three-way browser/webhook/history races converge without duplicate sessions or supplier permission',async()=>{
 for(let n=0;n<25;n++){const {t,o}=await opened(),e=t.event();const results=await Promise.allSettled([t.service.reconcile(t.owner,{orderId:o.id}),t.service.receive(e.raw,e.signature),t.service.history(t.owner)]);
  for(const r of results){if(r.status==='rejected')assert.ok([409,503].includes(r.reason.status));else assert.notEqual(r.value.realSupplierDispatchAllowed,true);}
  const final=await t.service.reconcile(t.owner,{orderId:o.id});assert.equal(final.captureConfirmed,true);assert.equal(final.realSupplierDispatchAllowed,false);assert.equal(t.counts.create,1);assert.equal((await t.service.history(t.owner)).records.length,1);
 }
});
test('a recorded adverse event remains a hold across racing rechecks and later success events',async()=>{
 for(let n=0;n<10;n++){const {t,o}=await opened();await t.service.reconcile(t.owner,{orderId:o.id});const bad=t.event('charge.refunded');await t.service.receive(bad.raw,bad.signature);const success=t.event();await Promise.allSettled([t.service.reconcile(t.owner,{orderId:o.id}),t.service.receive(success.raw,success.signature)]);const final=await t.service.reconcile(t.owner,{orderId:o.id});assert.equal(final.captureConfirmed,false);assert.equal(final.paymentGatePassed,false);assert.equal(t.counts.create,1);}
});
test('future-dated ledger evidence cannot be interpreted as current payment approval',async()=>{
 const {t,o}=await opened();await t.service.reconcile(t.owner,{orderId:o.id});const key=paymentRecordKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,t.pid),row=await t.paymentStore.read(key);await t.paymentStore.save(key,{...row.record,revision:row.record.revision+1,verifiedAt:new Date(t.now()+31000).toISOString()},row.etag);const status=await t.service.read(t.owner,o.id);assert.equal(status.captureConfirmed,false);assert.equal(status.paymentGatePassed,false);
});
test('five simultaneous finalization attempts resolve to one order and one history pointer',async()=>{
 for(let n=0;n<10;n++){const t=await cartPaymentFixture();const results=await Promise.allSettled(Array.from({length:5},()=>t.finalize()));for(const r of results)if(r.status==='rejected')assert.ok([409,503].includes(r.reason.status));const stable=await t.finalize(),history=await t.service.history(t.owner);assert.equal(history.records.length,1);assert.equal(history.records[0].id,stable.id);assert.equal(t.counts.create,0);}
});
