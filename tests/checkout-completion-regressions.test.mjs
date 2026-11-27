import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
const open=async t=>{const o=await t.finalize();await t.service.open(t.owner,{orderId:o.id,testConsent:true});return o;};
test('pause new checkout without preventing owner history and existing-payment recovery',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);t.paid();t.env.TP_CART_CHECKOUT_PREVIEW_ENABLED='false';
 assert.equal((await t.service.configuration()).ready,false);assert.equal((await t.service.configuration()).historyReady,true);
 assert.equal((await t.service.read(t.owner,o.id)).id,o.id);assert.equal((await t.service.history(t.owner)).records.length,1);
 assert.equal((await t.service.reconcile(t.owner,{orderId:o.id})).captureConfirmed,true);
 await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===503);assert.equal(t.counts.create,1);
});
test('a failed Session check durably invalidates earlier approval rather than restoring it on reload',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);t.paid();await t.service.reconcile(t.owner,{orderId:o.id});
 const original=t.client.checkout.sessions.retrieve;t.client.checkout.sessions.retrieve=async()=>{throw Error('synthetic timeout');};
 await assert.rejects(t.service.reconcile(t.owner,{orderId:o.id}),e=>e.status===503);
 assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);assert.equal((await t.service.history(t.owner)).records[0].paymentGatePassed,false);
 t.client.checkout.sessions.retrieve=original;assert.equal((await t.service.reconcile(t.owner,{orderId:o.id})).captureConfirmed,true);
});
test('untrusted Session amount clears a prior saved approval even within its freshness window',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);t.paid();await t.service.reconcile(t.owner,{orderId:o.id});t.setSessionPatch({amount_total:1});
 await assert.rejects(t.service.reconcile(t.owner,{orderId:o.id}),e=>e.status===409);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);
});
test('a retry on a replacement deployment keeps the original return URLs and exact request',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize();t.setCreateError(true);await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}));
 const first=structuredClone(t.requests[0]);t.advance(2000);t.env.VERCEL_BRANCH_URL='replacement.vercel.app';t.setCreateError(false);
 await t.service.open(t.owner,{orderId:o.id,testConsent:true});assert.deepEqual(t.requests[1],first);
});
test('expired session is persisted and remains closed on a saved-status reload',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);t.setSessionPatch({status:'expired',payment_status:'unpaid',url:null});
 const r=await t.service.reconcile(t.owner,{orderId:o.id});assert.equal(r.checkoutState,'expired');assert.equal(r.status,'checkout-expired');
 assert.equal((await t.service.read(t.owner,o.id)).status,'checkout-expired');assert.equal((await t.service.history(t.owner)).records[0].status,'checkout-expired');
 await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}));assert.equal(t.counts.create,1);
});
test('a Session create response with mismatched flow is rejected before exposing a checkout URL',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize(),original=t.client.checkout.sessions.create;
 t.client.checkout.sessions.create=async(...a)=>{const s=await original(...a);return {...s,metadata:{...s.metadata,tp_flow:'untrusted'}};};
 await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===503);
});
function expiry(t,{paidDuring=false,throwsAfter=false,neverExpires=false}={}){
 t.env.TP_STRIPE_TEST_CHECKOUT_EXPIRY_ENABLED='true';let calls=0;
 t.client.checkout.sessions.expire=async(id,params,options)=>{calls++;assert.equal(id,'cs_test_CARTSYNTHETIC123456');assert.match(options.idempotencyKey,/^tp-expire-test-/);assert.deepEqual(params,{});if(paidDuring)t.paid();else if(!neverExpires)t.setSessionPatch({status:'expired',payment_status:'unpaid',url:null});if(throwsAfter||neverExpires)throw Error('synthetic lost expiry response');return {};};
 return ()=>calls;
}
test('closing an unpaid test is independently confirmed and durable; repetition never creates payment',async()=>{
 const t=await cartPaymentFixture(),o=await open(t),calls=expiry(t);
 const r=await t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true});assert.equal(r.checkoutClosed,true);assert.equal(r.status,'checkout-expired');assert.equal(r.refundRequested,false);
 assert.equal((await t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true})).checkoutClosed,true);assert.equal(calls(),1);assert.equal(t.counts.create,1);
 assert.equal((await t.service.read(t.owner,o.id)).status,'checkout-expired');
});
test('closure requires explicit consent and separately enabled preview action',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);let calls=0;t.client.checkout.sessions.expire=async()=>{calls++;};
 await assert.rejects(t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:false}),e=>e.status===400);
 await assert.rejects(t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true}),e=>e.status===503);
 assert.equal(calls,0);assert.equal(t.counts.create,1);
});
test('foreign owners and extra refund fields never invoke expiry',async()=>{
 const t=await cartPaymentFixture(),o=await open(t),calls=expiry(t);
 await assert.rejects(t.service.closeCheckout(randomUUID(),{orderId:o.id,closeConsent:true}),e=>e.status===404);
 await assert.rejects(t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true,refund:true}),e=>e.status===400);assert.equal(calls(),0);
});
test('a paid Session is verified, never expired or automatically refunded',async()=>{
 const t=await cartPaymentFixture(),o=await open(t),calls=expiry(t);t.paid();const r=await t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true});
 assert.equal(r.checkoutClosed,false);assert.equal(r.captureConfirmed,true);assert.equal(r.refundRequested,false);assert.equal(calls(),0);
});
test('payment winning the expiry race is captured, retained, and never described as canceled',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);expiry(t,{paidDuring:true,throwsAfter:true});const r=await t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true});
 assert.equal(r.checkoutClosed,false);assert.equal(r.captureConfirmed,true);assert.equal(r.status,'test-payment-verified');assert.equal(r.refundRequested,false);assert.equal(t.counts.create,1);
});
test('lost expiry reply is resolved by reread, not inferred from success or failure of POST',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);expiry(t,{throwsAfter:true});assert.equal((await t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true})).checkoutClosed,true);
 const u=await cartPaymentFixture(),p=await open(u);expiry(u,{neverExpires:true});await assert.rejects(u.service.closeCheckout(u.owner,{orderId:p.id,closeConsent:true}),e=>e.status===503);assert.notEqual((await u.service.read(u.owner,p.id)).status,'checkout-expired');
});
test('creation pause does not prevent explicit closure of an existing unpaid sandbox Session',async()=>{
 const t=await cartPaymentFixture(),o=await open(t);expiry(t);t.env.TP_CART_CHECKOUT_PREVIEW_ENABLED='false';assert.equal((await t.service.closeCheckout(t.owner,{orderId:o.id,closeConsent:true})).checkoutClosed,true);
});
