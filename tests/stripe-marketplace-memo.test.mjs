import test from 'node:test';
import assert from 'node:assert/strict';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {sandboxFixture} from './stripe-sandbox-fixture.mjs';
import {checkoutSessionKey,createStripeCheckoutSessionBridge,memoryCheckoutSessionStore} from '../lib/stripe-checkout-session.mjs';
import {sandboxRunKey} from '../lib/stripe-sandbox-checkout.mjs';
import {finalOrder,env,now} from './payment-first-fixture.mjs';

const label='TPGS Marketplace';
const legacyParams=p=>{const result=structuredClone(p);delete result.metadata.tp_business_unit;delete result.payment_intent_data.metadata.tp_business_unit;delete result.payment_intent_data.description;return result;};
const observe=t=>{const requests=[],create=t.client.checkout.sessions.create;t.client.checkout.sessions.create=async(p,o)=>{requests.push({params:structuredClone(p),options:structuredClone(o)});return create(p,o);};return requests;};

test('new cart payment is organized on Session and PaymentIntent while preserving its order binding',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize();await t.service.open(t.owner,{orderId:o.id,testConsent:true});const p=t.requests[0];
 assert.equal(p.metadata.tp_business_unit,label);assert.equal(p.payment_intent_data.metadata.tp_business_unit,label);assert.equal(p.metadata.tp_order_id,o.id);assert.equal(p.payment_intent_data.metadata.tp_quote_digest,p.metadata.tp_quote_digest);assert.equal(p.payment_intent_data.description,`${label} | TEST order ${o.id}`);assert.equal(p.payment_intent_data.capture_method,'automatic');
 assert.equal((await t.checkoutStore.read(checkoutSessionKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,o.id))).record.stripeMemoVersion,1);
 assert.equal(p.payment_intent_data.statement_descriptor_suffix,undefined);assert.equal(p.payment_intent_data.statement_descriptor,undefined);
});

test('new staff-only checkout also carries the marketplace label without changing totals',async()=>{
 const o=finalOrder(),requests=[],client={accounts:{retrieve:async()=>({id:env.TP_STRIPE_TEST_ACCOUNT_ID})},checkout:{sessions:{create:async p=>{requests.push(structuredClone(p));throw Error('synthetic uncertain create');}}}};
 const bridge=createStripeCheckoutSessionBridge({env:{...env,TP_STRIPE_TEST_CHECKOUT_ENABLED:'true',VERCEL_URL:'synthetic.vercel.app'},stripeClient:client,orderStore:{get:async()=>o},store:memoryCheckoutSessionStore(),clock:()=>now});
 await assert.rejects(bridge.begin(o.id),e=>e.status===503);const p=requests[0];assert.equal(p.metadata.tp_business_unit,label);assert.equal(p.payment_intent_data.metadata.tp_business_unit,label);assert.equal(p.line_items.reduce((n,x)=>n+x.quantity*x.price_data.unit_amount,0),o.totalCents);assert.equal(p.automatic_tax.enabled,false);
});

test('new uncertain cart attempts replay identical labeled Stripe parameters and one idempotency key',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize();t.setCreateError(true);await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===503);const first=structuredClone(t.requests[0]),key=t.createOptions().idempotencyKey;t.advance(2500);t.setCreateError(false);await t.service.open(t.owner,{orderId:o.id,testConsent:true});assert.deepEqual(t.requests[1],first);assert.equal(t.createOptions().idempotencyKey,key);
});

test('pre-label cart attempts retain legacy parameters across retries and deployment origins',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize();t.setCreateError(true);await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===503);const expected=legacyParams(t.requests[0]),key=checkoutSessionKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,o.id),row=await t.checkoutStore.read(key),idempotency=t.createOptions().idempotencyKey;delete row.record.stripeMemoVersion;await t.checkoutStore.save(key,row.record,row.etag);t.env.VERCEL_BRANCH_URL='new-deployment.vercel.app';t.advance(2500);
 for(let i=0;i<2;i++){await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===503);assert.deepEqual(t.requests.at(-1),expected);assert.equal(t.createOptions().idempotencyKey,idempotency);}
});

test('unknown saved memo version stops cart creation before another provider create',async()=>{
 const t=await cartPaymentFixture(),o=await t.finalize();t.setCreateError(true);await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}));const key=checkoutSessionKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,o.id),row=await t.checkoutStore.read(key);row.record.stripeMemoVersion=2;await t.checkoutStore.save(key,row.record,row.etag);const before=t.counts.create;await assert.rejects(t.service.open(t.owner,{orderId:o.id,testConsent:true}),e=>e.status===409);assert.equal(t.counts.create,before);
});

test('fixed connectivity tests are labeled with their synthetic purpose and keep identical retry parameters',async()=>{
 const t=sandboxFixture(),requests=observe(t);t.setCreateError(true);await assert.rejects(t.service.start(t.owner,t.id,true),e=>e.status===503);const p=requests[0].params;assert.equal(p.metadata.tp_business_unit,label);assert.equal(p.payment_intent_data.metadata.tp_business_unit,label);assert.equal(p.payment_intent_data.description,`${label} | SANDBOX TEST ${t.id} | No goods or services`);t.setCreateError(false);await t.service.start(t.owner,t.id,true);assert.deepEqual(requests[1],requests[0]);const reused=await t.service.start(t.owner,t.id,true);assert.equal(reused.duplicate,true);assert.equal(requests.length,2);
});

test('pre-label fixed test attempts retain their old Stripe body and key',async()=>{
 const t=sandboxFixture(),requests=observe(t);t.setCreateError(true);await assert.rejects(t.service.start(t.owner,t.id,true));const expected=legacyParams(requests[0].params),key=sandboxRunKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,t.id),row=await t.store.read(key);delete row.record.stripeMemoVersion;await t.store.save(key,row.record,row.etag);t.setCreateError(false);await t.service.start(t.owner,t.id,true);assert.deepEqual(requests[1].params,expected);assert.deepEqual(requests[1].options,requests[0].options);
});

test('unknown saved fixed-test memo version never initiates another Stripe create',async()=>{
 const t=sandboxFixture();t.setCreateError(true);await assert.rejects(t.service.start(t.owner,t.id,true));const key=sandboxRunKey(t.env.TP_STRIPE_TEST_ACCOUNT_ID,t.id),row=await t.store.read(key);row.record.stripeMemoVersion='1';await t.store.save(key,row.record,row.etag);await assert.rejects(t.service.start(t.owner,t.id,true),e=>e.status===409);assert.equal(t.calls.create,1);
});
