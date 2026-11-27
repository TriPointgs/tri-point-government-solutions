import test from 'node:test';import assert from 'node:assert/strict';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {eventBytes} from './payment-first-fixture.mjs';
const started=async()=>{const t=await cartPaymentFixture(),o=await t.finalize();await t.service.open(t.owner,{orderId:o.id,testConsent:true});return {t,o};};
test('signed completed checkout verifies canonical payment before any browser returns',async()=>{
 const {t,o}=await started();t.paid();const e=await t.sessionEvent(),r=await t.service.receive(e.raw,e.signature);assert.equal(r.paymentGatePassed,true);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,true);assert.equal(t.counts.create,1);
 const replay=await t.service.receive(e.raw,e.signature);assert.equal(replay.duplicate,true);assert.equal(t.counts.create,1);
});
test('signed expired checkout persists closure without needing a PaymentIntent',async()=>{
 const {t,o}=await started();t.setSessionPatch({status:'expired',payment_status:'unpaid',payment_intent:null,url:null});const e=await t.sessionEvent('checkout.session.expired');const r=await t.service.receive(e.raw,e.signature);assert.equal(r.checkoutState,'expired');assert.equal(r.captureConfirmed,false);assert.equal((await t.service.read(t.owner,o.id)).status,'checkout-expired');
});
test('an expiry event is not proof of expiry when Stripe still returns an open Session',async()=>{
 const {t,o}=await started();const e=await t.sessionEvent('checkout.session.expired');await assert.rejects(t.service.receive(e.raw,e.signature),e=>e.status===409);assert.notEqual((await t.service.read(t.owner,o.id)).status,'checkout-expired');
});
test('signed event for another Session does not bind payment to this order',async()=>{
 const {t,o}=await started();t.paid();const s=await t.client.checkout.sessions.retrieve('cs_test_CARTSYNTHETIC123456');const e=eventBytes({type:'checkout.session.completed',at:t.now(),object:{...s,id:'cs_test_FOREIGN123456'}});await assert.rejects(t.service.receive(e.raw,e.signature),e=>e.status===409);assert.equal((await t.service.read(t.owner,o.id)).paymentRecordSaved,false);
});
test('signed event with mismatched PaymentIntent cannot approve a different payment',async()=>{
 const {t,o}=await started();t.paid();const s=await t.client.checkout.sessions.retrieve('cs_test_CARTSYNTHETIC123456');const e=eventBytes({type:'checkout.session.completed',at:t.now(),object:{...s,payment_intent:'pi_FOREIGN123456'}});await assert.rejects(t.service.receive(e.raw,e.signature),e=>e.status===409);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);
});
test('unsigned Session event and unrelated Session flow cannot mutate saved orders',async()=>{
 const {t,o}=await started();t.paid();const e=await t.sessionEvent();await assert.rejects(t.service.receive(e.raw,'invalid'),e=>e.status===400);
 const s=await t.client.checkout.sessions.retrieve('cs_test_CARTSYNTHETIC123456');const unrelated=eventBytes({type:'checkout.session.completed',at:t.now(),object:{...s,metadata:{}}});assert.equal((await t.service.receive(unrelated.raw,unrelated.signature)).ignored,true);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);
});
