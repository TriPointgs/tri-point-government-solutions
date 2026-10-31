import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';import {createCartCheckoutHandler} from '../lib/cart-checkout-handler.mjs';import {sign} from '../lib/security.mjs';
process.env.NODE_ENV='test';process.env.TP_SESSION_SECRET='synthetic-admin-recovery-test-key-not-real';
async function fixture(){const t=await cartPaymentFixture(),o=await t.finalize();await t.service.open(t.owner,{orderId:o.id,testConsent:true});t.paid();return {t,o};}
async function request(t,{method='GET',view='cart-checkout-admin-order',order,token=sign({type:'admin',at:Date.now()}),origin='http://localhost:3000',input,env=t.env}={}){let data='';const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v=''){data=v;}};await createCartCheckoutHandler({env,service:t.service,rate:async()=>{}})({method,url:'/api/shop?view='+view+(order?'&order='+order:''),headers:{origin,'content-type':'application/json',cookie:token?'__Host-tp_admin='+token:''},body:input},res);return {status:res.statusCode,headers:res.headers,data};}
test('authenticated admin recovers a known test order without an original browser cookie or ownership transfer',async()=>{
 const {t,o}=await fixture(),before={...t.counts},read=await request(t,{order:o.id});assert.equal(read.status,200);assert.deepEqual(t.counts,before);assert.equal(read.headers['Set-Cookie'],undefined);assert.equal(JSON.parse(read.data).id,o.id);
 const check=await request(t,{method:'POST',view:'cart-checkout-action',input:{action:'admin-reconcile-order',orderId:o.id,recoveryConsent:true}});assert.equal(check.status,200);const result=JSON.parse(check.data);assert.equal(result.captureConfirmed,true);assert.equal(result.realSupplierDispatchAllowed,false);assert.equal(t.counts.create,1);assert.equal((await t.store.read(o.id)).record.owner,t.owner);
 assert.doesNotMatch(check.data,/pi_|cs_test_|owner|privateContact|privateAddress|sk_test_|buyer@example/);
});
test('anonymous and contractor sessions cannot use recovery to bypass cart ownership',async()=>{
 const {t,o}=await fixture(),before={...t.counts};for(const token of ['',sign({type:'contractor',at:Date.now()})])for(const config of [{order:o.id},{method:'POST',view:'cart-checkout-action',input:{action:'admin-reconcile-order',orderId:o.id,recoveryConsent:true}}]){const r=await request(t,{...config,token});assert.equal(r.status,401);}assert.deepEqual(t.counts,before);
});
test('admin recovery write rejects CSRF, absent consent and user-supplied ownership or payment flags',async()=>{
 const {t,o}=await fixture(),before={...t.counts},input={action:'admin-reconcile-order',orderId:o.id,recoveryConsent:true};
 for(const opts of [{origin:'https://evil.test',input},{input:{...input,recoveryConsent:false}},{input:{...input,owner:randomUUID()}},{input:{...input,paid:true}}]){const r=await request(t,{method:'POST',view:'cart-checkout-action',...opts});assert.ok([400,403].includes(r.status));}assert.deepEqual(t.counts,before);
});
test('admin recovery preserves pending creation pause and cannot create absent orders',async()=>{
 const {t,o}=await fixture();t.env.TP_CART_CHECKOUT_PREVIEW_ENABLED='false';assert.equal((await t.service.administratorReconcile({orderId:o.id,recoveryConsent:true})).captureConfirmed,true);
 await assert.rejects(t.service.administratorRead(randomUUID()),e=>e.status===404);await assert.rejects(t.service.administratorReconcile({orderId:randomUUID(),recoveryConsent:true}),e=>e.status===404);assert.equal(t.counts.create,1);
});
test('recovery page redirects anonymous admin login and rejects production access',async()=>{
 const {t}=await fixture();const page=await request(t,{view:'cart-checkout-recovery-page'});assert.equal(page.status,200);assert.match(page.data,/ADMINISTRATOR RECOVERY/);const anonymous=await request(t,{view:'cart-checkout-recovery-page',token:''});assert.equal(anonymous.status,303);assert.match(anonymous.headers.Location,/checkout-recovery/);
 for(const view of ['cart-checkout-recovery-page','cart-checkout-admin-order'])assert.equal((await request(t,{view,env:{VERCEL_ENV:'production'}})).status,503);
});
test('unpaid closure is protected by existing owner, CSRF and explicit confirmation on its routed API',async()=>{
 const {t,o}=await fixture();for(const opts of [{input:{action:'close-checkout',orderId:o.id,closeConsent:true}},{token:'',input:{action:'close-checkout',orderId:o.id,closeConsent:true}},{origin:'https://evil.test',input:{action:'close-checkout',orderId:o.id,closeConsent:true}}]){const r=await request(t,{method:'POST',view:'cart-checkout-action',...opts});assert.ok(r.status>=400);}assert.equal(t.counts.create,1);
});
