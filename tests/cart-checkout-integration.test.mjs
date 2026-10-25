import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {paymentOrderKey,paymentRecordKey} from '../lib/payment-verification-store.mjs';
import {checkoutSessionKey} from '../lib/stripe-checkout-session.mjs';
import {createPaymentVerificationService} from '../lib/payment-verification-service.mjs';
const opened=async t=>{const o=await t.finalize();return t.service.open(t.owner,{orderId:o.id,testConsent:true});};
test('cart review to immutable order, exact test Checkout, verified payment and durable status works end to end',async()=>{
 const t=await cartPaymentFixture();assert.equal((await t.service.configuration()).ready,true);const o=await opened(t);
 assert.equal(o.totalCents,25750);assert.equal(o.taxCents,1500);assert.match(o.checkoutURL,/^https:\/\/checkout.stripe.com\//);assert.equal(o.paymentGatePassed,false);
 const req=t.requests[0];assert.equal(req.payment_intent_data.capture_method,'automatic');assert.equal(req.payment_intent_data.metadata.tp_flow,'tp-cart-checkout-v1');assert.equal(req.expires_at,Math.floor(t.now()/1000)+1860);assert.match(req.success_url,/checkout-return\?order=/);assert.doesNotMatch(req.success_url,/session_id|payment_status/);assert.equal(req.automatic_tax.enabled,false);
 t.paid();const saved=await t.service.reconcile(t.owner,{orderId:o.id});assert.equal(saved.status,'test-payment-verified');assert.equal(saved.paymentGatePassed,true);assert.equal(saved.captureConfirmed,true);assert.equal(saved.paymentRecordSaved,true);assert.equal(saved.realSupplierDispatchAllowed,false);assert.equal(saved.emailSent,false);
 const reread=await t.service.read(t.owner,o.id);assert.equal(reread.captureConfirmed,true);assert.equal(t.counts.create,1);
 assert.doesNotMatch(JSON.stringify(reread),/pi_|cs_test_|privateContact|Test Street|buyer@example|reviewEvidence|sk_test_|whsec_|costCents|NEVER-RETURN/);
});
test('signed success before browser return links to the correct stored order and records capture',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.paid();const e=t.event();const result=await t.service.receive(e.raw,e.signature);
 assert.equal(result.paymentGatePassed,true);assert.equal((await t.service.read(t.owner,o.id)).status,'test-payment-verified');
 const count=t.counts.intent;const duplicate=await t.service.receive(e.raw,e.signature);assert.equal(duplicate.duplicate,true);assert.equal(t.counts.intent,count);
});
test('late captured payment is saved but quote expiry never passes payment release gate',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.paid();t.advance(900001);
 const result=await t.service.reconcile(t.owner,{orderId:o.id});assert.equal(result.captureConfirmed,true);assert.equal(result.paymentGatePassed,false);assert.equal(result.status,'captured-review-required');assert.ok(result.paymentReasons.includes('order_requote_required'));assert.equal(result.realSupplierDispatchAllowed,false);
 const link=await t.paymentStore.read(paymentOrderKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,o.id));assert.equal(link.record.binding.expiresAt,o.quoteExpiresAt);assert.ok(Date.parse(link.record.binding.createdAt)<t.now());
 await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===409);assert.equal(t.counts.create,1);
});
test('late success webhook without a browser records capture under the expired quote hold',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.paid();t.advance(900001);const e=t.event();const r=await t.service.receive(e.raw,e.signature);
 assert.equal(r.captureConfirmed,true);assert.equal(r.paymentGatePassed,false);assert.equal((await t.service.read(t.owner,o.id)).status,'captured-review-required');
});
test('expired unpaid and canceled checkouts cannot be replaced by a second payment session',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.advance(900001);const r=await t.service.reconcile(t.owner,{orderId:o.id});assert.equal(r.captureConfirmed,false);assert.equal(r.checkoutState,'quote-expired');assert.equal(t.counts.create,1);
 await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===409);
});
test('read-only saved status never queries Stripe or creates checkout',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize(),before={...t.counts};await t.service.read(t.owner,o.id);assert.deepEqual(t.counts,before);
});
test('cross-owner order reads and payment actions fail before contacting Stripe',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t),before={...t.counts},other=randomUUID();
 for(const fn of [()=>t.service.read(other,o.id),()=>t.service.open(other,{orderId:o.id,testConsent:true}),()=>t.service.reconcile(other,{orderId:o.id})])await assert.rejects(fn,e=>e.status===404);
 assert.deepEqual(t.counts,before);
});
test('finalization rejects browser totals, mismatched terms digest and missing separate test consent',async()=>{
 for(const patch of [{totalCents:1},{paid:true},{termsDigest:'b'.repeat(64)},{testConsent:false},{termsAccepted:false}]){const t=await cartPaymentFixture();await assert.rejects(t.service.finalize(t.owner,{...t.request,...patch}),e=>e.status===400);assert.equal(t.counts.create,0);}
});
test('missing or altered approved terms text keeps readiness blocked',async()=>{
 for(const text of [undefined,'tampered']){const t=await cartPaymentFixture();t.policy().terms.text=text;const c=await t.service.configuration();assert.equal(c.ready,false);assert.equal(c.terms,null);await assert.rejects(t.finalize(),e=>e.status===503);assert.equal(t.counts.create,0);}
});
test('unreviewed shipping and tax setup cannot be bypassed by the integration flag',async()=>{
 for(const kind of ['shipping','tax']){const t=await cartPaymentFixture();if(kind==='shipping')t.policy().shipping.approved=false;else t.policy().tax.reviewed=false;assert.equal((await t.service.configuration()).ready,false);await assert.rejects(t.finalize(),e=>e.status===503);}
});
test('new cart/price/stock/policy changes after finalization block a payment start',async()=>{
 for(const change of ['cart','stock','policy']){const t=await cartPaymentFixture(),o=await t.finalize();if(change==='cart'){const v=await t.baseCart.read(t.owner);v.cart.revision++;await t.baseCart.save(v.cart,v.etag);}if(change==='stock'){const old=t.td.lookup;t.td.lookup=async(...a)=>(await old(...a)).map(x=>({...x,stockQuantity:0}));}if(change==='policy')t.policy().revision++;
 await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===409);assert.equal(t.counts.create,0);}
});
test('same saved order reuses its open checkout instead of creating another session',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t),r=await t.service.open(t.owner,{orderId:o.id,testConsent:true});assert.equal(r.duplicate,true);assert.equal(t.counts.create,1);assert.equal(r.checkoutURL,o.checkoutURL);
});
test('uncertain create retries the same order with the same Stripe idempotency key',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize();t.setCreateError(true);await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===503);const key=t.createOptions().idempotencyKey,firstRequest=structuredClone(t.requests[0]);t.advance(2000);t.setCreateError(false);await t.service.open(t.owner,{orderId:o.id,testConsent:true});assert.equal(t.createOptions().idempotencyKey,key);assert.deepEqual(t.requests[1],firstRequest);
});
test('mismatched Session, amount or payment metadata never writes a paid binding',async()=>{
 for(const patch of [{amount_total:1},{livemode:true},{client_reference_id:randomUUID()},{metadata:{}}]){const t=await cartPaymentFixture(),o=await opened(t);t.paid();t.setSessionPatch(patch);await assert.rejects(t.service.reconcile(t.owner,{orderId:o.id}),e=>e.status===409);assert.equal(await t.paymentStore.read(paymentOrderKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,o.id)),null);}
});
test('unpaid browser return does not mark paid or persist a forged binding',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t),r=await t.service.reconcile(t.owner,{orderId:o.id});assert.equal(r.captureConfirmed,false);assert.equal(r.paymentRecordSaved,false);
 await assert.rejects(t.service.reconcile(t.owner,{orderId:o.id,paid:true}),e=>e.status===400);
});
test('refunded payment and adverse event remain held after later success delivery',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.paid();const adverse=t.event('charge.refunded');await t.service.receive(adverse.raw,adverse.signature);const success=t.event();await t.service.receive(success.raw,success.signature);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);
 const v=await cartPaymentFixture(),p=await opened(v);v.paid();v.refund();assert.equal((await v.service.reconcile(v.owner,{orderId:p.id})).captureConfirmed,false);
});
test('stale saved proof requires a new server check and provider failure clears prior approval',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.paid();await t.service.reconcile(t.owner,{orderId:o.id});t.advance(61000);assert.equal((await t.service.read(t.owner,o.id)).captureConfirmed,false);t.setIntentError(true);await assert.rejects(t.service.reconcile(t.owner,{orderId:o.id}),e=>e.status===503);assert.equal((await t.service.read(t.owner,o.id)).paymentGatePassed,false);
});
test('plain JSON cannot forge the original-quote reconciliation proof',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t),record=await t.store.read(o.id),service=createPaymentVerificationService({env:t.env,verifier:t.verifier,store:t.paymentStore,clock:t.now});await assert.rejects(service.bindCheckoutOrder(record.record.order,{orderId:o.id,mode:'test',accountId:t.env.TP_STRIPE_TEST_ACCOUNT_ID,paymentId:t.pid,openedAt:new Date(t.now()).toISOString(),checkedAt:new Date(t.now()).toISOString()}),e=>e.status===400);
});
test('anonymous/forged webhook and cross-order linkage cannot create payment records',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.paid();const e=t.event();await assert.rejects(t.service.receive(e.raw,'forged'),e=>e.status===400);assert.equal(await t.paymentStore.read(paymentRecordKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,t.pid)),null);
});
test('production or disabled integration refuses actions without creating Stripe sessions',async()=>{
 for(const patch of [{VERCEL_ENV:'production'},{TP_CART_CHECKOUT_PREVIEW_ENABLED:'false'}]){const t=await cartPaymentFixture({patch});assert.equal((await t.service.configuration()).ready,false);await assert.rejects(t.finalize(),e=>e.status===503);assert.equal(t.counts.create,0);}
});
test('turning off new checkout creation does not discard a signed payment from an already-opened checkout',async()=>{
 const t=await cartPaymentFixture(),o=await opened(t);t.env.TP_CART_CHECKOUT_PREVIEW_ENABLED='false';t.paid();const e=t.event();assert.equal((await t.service.receive(e.raw,e.signature)).paymentGatePassed,true);assert.equal(t.counts.create,1);
});
test('concurrent checkout starts use the same provider idempotency key and same stored session',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize(),keys=[],original=t.client.checkout.sessions.create;t.client.checkout.sessions.create=async(p,opt)=>{keys.push(opt.idempotencyKey);return original(p,opt);};
 const results=await Promise.allSettled([t.service.open(t.owner,{orderId:o.id,testConsent:true}),t.service.open(t.owner,{orderId:o.id,testConsent:true})]);
 assert.ok(results.some(x=>x.status==='fulfilled'));assert.equal(new Set(keys).size,1);const row=await t.checkoutStore.read(checkoutSessionKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,o.id));assert.equal(row.record.orderId,o.id);assert.equal(row.record.state,'open');
});
