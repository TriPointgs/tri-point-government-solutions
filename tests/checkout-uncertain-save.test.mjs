import test from 'node:test';import assert from 'node:assert/strict';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {memoryCheckoutSessionStore,checkoutSessionKey} from '../lib/stripe-checkout-session.mjs';
async function pending(){const base=memoryCheckoutSessionStore();let reject=true;const store={read:k=>base.read(k),save:async(k,r,e)=>{if(reject&&r.state==='open')throw Error('synthetic dropped storage update');return base.save(k,r,e);}};const t=await cartPaymentFixture({checkoutStore:store}),o=await t.finalize();await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===503);return {t,o,base,allow:()=>{reject=false;}};}
test('signed payment recovers an existing Session whose original save was lost, without creating a replacement',async()=>{
 const {t,o,allow}=await pending();allow();t.paid();const e=t.event();const r=await t.service.receive(e.raw,e.signature);
 assert.equal(r.paymentGatePassed,true);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,true);assert.equal(t.counts.create,1);
});
test('late signed payment recovers original Session but retains original expired-quote hold',async()=>{
 const {t,o,allow}=await pending();allow();t.paid();t.advance(900001);const e=t.event();const r=await t.service.receive(e.raw,e.signature);
 assert.equal(r.captureConfirmed,true);assert.equal(r.paymentGatePassed,false);assert.equal((await t.service.read(t.owner,o.id)).status,'captured-review-required');assert.equal(t.counts.create,1);
});
test('zero, ambiguous or truncated Session lists cannot fabricate recovery',async()=>{
 for(const shape of ['empty','duplicate','more']){const {t,o,allow}=await pending();allow();t.paid();const original=t.client.checkout.sessions.list.bind(t.client.checkout.sessions);
  t.client.checkout.sessions.list=async(...a)=>{const r=await original(...a);if(shape==='empty')r.data=[];if(shape==='duplicate')r.data.push({...r.data[0],id:'cs_test_OTHER123456'});if(shape==='more')r.has_more=true;return r;};
  const e=t.event();await assert.rejects(t.service.receive(e.raw,e.signature),e=>e.status===409);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);assert.equal(t.counts.create,1);
 }
});
test('mismatched recovered amount, metadata, timestamp or payment is denied without approving a record',async()=>{
 for(const patch of [{amount_total:1},{livemode:true},{payment_intent:'pi_OTHER123456'},{metadata:{}},{created:0}]){const {t,o,allow}=await pending();allow();t.paid();const original=t.client.checkout.sessions.list.bind(t.client.checkout.sessions);t.client.checkout.sessions.list=async(...a)=>{const r=await original(...a);r.data[0]={...r.data[0],...patch};return r;};const e=t.event();await assert.rejects(t.service.receive(e.raw,e.signature),e=>e.status===409);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);}
});
test('a recovery storage failure leaves the order unapproved and the same event remains retryable',async()=>{
 const {t,o,allow}=await pending();t.paid();const e=t.event();await assert.rejects(t.service.receive(e.raw,e.signature),e=>e.status===503);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);allow();assert.equal((await t.service.receive(e.raw,e.signature)).paymentGatePassed,true);
});
