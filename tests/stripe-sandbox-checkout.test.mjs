import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import fs from 'node:fs';
import {sandboxFixture,demoEnv,demoNow} from './stripe-sandbox-fixture.mjs';
import {createStripeSandboxCheckout,sandboxCheckoutConfiguration,sandboxRunKey,createSandboxRunStore,memorySandboxRunStore} from '../lib/stripe-sandbox-checkout.mjs';
import {createStripeSandboxHandler} from '../lib/stripe-sandbox-handler.mjs';
import {createPaymentVerificationService} from '../lib/payment-verification-service.mjs';import {memoryPaymentVerificationStore} from '../lib/payment-verification-store.mjs';import {stripeSandboxPage} from '../lib/stripe-sandbox-page.mjs';import {sign} from '../lib/security.mjs';
const start=t=>t.service.start(t.owner,t.id,true);
test('sandbox checkout is independently disabled by default and always blocked in production',async()=>{for(const patch of [{TP_STRIPE_SANDBOX_CHECKOUT_ENABLED:'false'},{VERCEL_ENV:'production'},{TP_STRIPE_TEST_READS_ENABLED:'false'},{TP_STRIPE_TEST_SECRET_KEY:''}]){const t=sandboxFixture({env:{...demoEnv,...patch}});assert.equal(t.service.configuration().enabled,false);await assert.rejects(start(t),e=>e.status===503);assert.equal(t.calls.create,0);}});
test('explicit test notice and server-minted reference required before creating fixed test payment',async()=>{const t=sandboxFixture();await assert.rejects(t.service.start(t.owner,t.id,false),e=>e.status===400);await assert.rejects(t.service.start(t.owner,'../id',true),e=>e.status===400);assert.equal(t.calls.create,0);});
test('fixed $20 synthetic session returns a validated URL but no commercial payment or order evidence',async()=>{const t=sandboxFixture(),r=await start(t);assert.equal(r.amountCents,2000);assert.match(r.url,/^https:\/\/checkout.stripe.com\//);assert.equal(r.state,'open');assert.equal(r.capturedTestPaymentVerified,false);assert.equal(r.commercialOrderPaid,false);assert.equal(r.supplierOrderSubmitted,false);assert.equal(t.calls.create,1);});
test('an account mismatch blocks Stripe session creation',async()=>{const t=sandboxFixture();t.setWrongAccount();await assert.rejects(start(t),e=>e.status===503);assert.equal(t.calls.create,0);});
test('wrong amount/mode/reference/payment methods/untrusted URL never becomes a customer checkout link',async()=>{for(const change of [{livemode:true},{amount_total:1},{currency:'eur'},{client_reference_id:randomUUID()},{url:'https://checkout.stripe.com.evil.example/test'},{payment_method_types:['card','us_bank_account']},{metadata:{}}]){const t=sandboxFixture();t.setSessionMutation(change);await assert.rejects(start(t),e=>e.status===503);}});
test('same test reference is replay-safe and does not create a second Stripe session',async()=>{const t=sandboxFixture(),a=await start(t),b=await start(t);assert.equal(a.id,b.id);assert.equal(b.duplicate,true);assert.equal(t.calls.create,1);});
test('parallel test starts share the same Stripe idempotency key and record',async()=>{const t=sandboxFixture();const r=await Promise.all([start(t),start(t)]);assert.equal(t.sessions.size,1);assert.equal(r[0].id,r[1].id);});
test('uncertain Stripe create can be recovered using the same test reference, never silently a new payment',async()=>{const t=sandboxFixture();t.setCreateError();await assert.rejects(start(t),e=>e.status===503&&!e.message.includes('PRIVATE'));t.setCreateError(false);const r=await start(t);assert.equal(r.state,'open');assert.equal(t.sessions.size,1);});
test('different browser owner cannot view or reuse another merchant test reference',async()=>{const t=sandboxFixture();await start(t);await assert.rejects(t.service.status(randomUUID(),t.id),e=>e.status===404);await assert.rejects(t.service.start(randomUUID(),t.id,true),e=>e.status===404);});
test('status reads use saved evidence without contacting Stripe and omit customer/card data',async()=>{const t=sandboxFixture();await start(t);const count={...t.calls},r=await t.service.status(t.owner,t.id);assert.deepEqual(t.calls,count);assert.doesNotMatch(JSON.stringify(r),/SECRET|private@example|PRIVATE STREET|sk_test_|whsec_|pi_/);});
test('return browser success alone cannot mark a test paid',async()=>{const t=sandboxFixture();await start(t);const r=await t.service.check(t.owner,t.id);assert.equal(r.state,'open');assert.equal(r.capturedTestPaymentVerified,false);assert.equal(r.realSupplierDispatchAllowed,false);});
test('server retrieves Session and PaymentIntent/Charge to verify actual captured sandbox payment',async()=>{const t=sandboxFixture();await start(t);t.setPaid();const r=await t.service.check(t.owner,t.id);assert.equal(r.capturedTestPaymentVerified,true);assert.equal(r.state,'captured');assert.equal(t.calls.intent,1);assert.equal(r.commercialOrderCreated,false);assert.equal(r.realSupplierDispatchAllowed,false);assert.doesNotMatch(JSON.stringify(r),/SECRET_CARD_HINT|billing_details|shipping/);});
test('captured payment with a current refund or dispute is held',async()=>{for(const change of ['setRefund','setHold']){const t=sandboxFixture();await start(t);t.setPaid();t[change]();const r=await t.service.check(t.owner,t.id);assert.equal(r.state,'needs-review');assert.equal(r.capturedTestPaymentVerified,false);}});
test('signed webhook for exact saved test is routed to demo verification without creating a commercial ledger',async()=>{const t=sandboxFixture();await start(t);t.setPaid();const payment=createPaymentVerificationService({env:demoEnv,verifier:t.verifier,sandboxCheckout:t.service,store:memoryPaymentVerificationStore(),clock:()=>demoNow});const e=t.event(),r=await payment.receive(e.raw,e.signature);assert.equal(r.capturedTestPaymentVerified,true);assert.equal(r.commercialOrderCreated,false);assert.equal(r.realSupplierDispatchAllowed,false);});
test('bad signatures and forged event objects cannot enter sandbox webhook verification',async()=>{const t=sandboxFixture();await start(t);await assert.rejects(t.service.receive({sandboxDemoId:t.id,paymentId:'pi_FAKE',type:'payment_intent.succeeded'}),e=>e.status===400);assert.throws(()=>t.verifier.parseEvent(Buffer.from('{}'),'bad'),e=>e.status===400);assert.equal(t.calls.retrieve,0);});
test('duplicate signed event does not add duplicate records or repeated provider reads',async()=>{const t=sandboxFixture();await start(t);t.setPaid();const e=t.event(),parsed=t.verifier.parseEvent(e.raw,e.signature);await t.service.receive(parsed);const count=t.calls.retrieve,r=await t.service.receive(parsed);assert.equal(r.duplicate,true);assert.equal(t.calls.retrieve,count);});
test('adverse signed event remains held even if a later success event arrives',async()=>{const t=sandboxFixture();await start(t);t.setPaid();const d=t.event({type:'charge.refunded',eventId:'evt_ADVERSE12345'});await t.service.receive(t.verifier.parseEvent(d.raw,d.signature));const s=t.event({eventId:'evt_LATESUCCESS123'}),r=await t.service.receive(t.verifier.parseEvent(s.raw,s.signature));assert.equal(r.capturedTestPaymentVerified,false);assert.equal(r.state,'needs-review');});
test('failed processor read invalidates current success rather than showing stale paid status',async()=>{const t=sandboxFixture();await start(t);t.setPaid();await t.service.check(t.owner,t.id);t.setReadError();await assert.rejects(t.service.check(t.owner,t.id),e=>e.status===503);const r=await t.service.status(t.owner,t.id);assert.equal(r.state,'check-failed');assert.equal(r.capturedTestPaymentVerified,false);});
test('older browser verification is explicitly marked as historical',async()=>{let now=demoNow;const t=sandboxFixture({clock:()=>now});await start(t);t.setPaid();await t.service.check(t.owner,t.id);now+=61000;const r=await t.service.status(t.owner,t.id);assert.equal(r.verificationCurrent,false);assert.equal(r.capturedTestPaymentVerified,true);assert.equal(r.commercialOrderPaid,false);});
test('expired test session never returns its old payment link',async()=>{let now=demoNow;const t=sandboxFixture({clock:()=>now});await start(t);now+=3600001;const r=await t.service.status(t.owner,t.id);assert.equal(r.expired,true);assert.equal(r.url,undefined);});
test('long-delayed unfinished create requires a new deliberate test rather than replay outside the safety window',async()=>{let now=demoNow;const t=sandboxFixture({clock:()=>now});t.setCreateError();await assert.rejects(start(t));now+=300001;t.setCreateError(false);await assert.rejects(start(t),e=>e.status===409);assert.equal(t.calls.create,1);});
test('original logos are byte-identical and sandbox page never says a real order was accepted',()=>{assert.equal(createHash('sha256').update(fs.readFileSync('assets/tripoint-logo.svg')).digest('hex'),'7c7f1f35bf2d84b05aa5389ab319ad389305b15f6a8d17cb0c81f40183918f5d');const html=stripeSandboxPage();assert.match(html,/test funds only/);assert.match(html,/noindex/);assert.match(html,/No product, service, tax determination/);assert.doesNotMatch(html,/Order confirmed|Purchase complete|sk_test_|whsec_/);});
test('verification claim distinguishes concurrent write conflict from unrelated storage errors and never changes payment state',async()=>{
 for(const {kind,status,text} of [{kind:'etag_conflict',status:503,text:'storage version mismatch'},{kind:'PRIVATE STORAGE FAILURE',status:503,text:'verification record could not be updated'}]){
  const base=memorySandboxRunStore();let failClaim=false;
  const store={read:key=>base.read(key),save:(key,row,tag)=>failClaim&&row.state==='checking'?Promise.reject(Error(kind)):base.save(key,row,tag)};
  const t=sandboxFixture({store});await start(t);failClaim=true;
  await assert.rejects(t.service.check(t.owner,t.id),e=>e.status===status&&e.message.includes(text)&&!e.message.includes('PRIVATE'));
  const result=await t.service.status(t.owner,t.id);
  assert.equal(result.state,'open');assert.equal(result.capturedTestPaymentVerified,false);assert.equal(t.calls.retrieve,0);
 }
});
test('a genuine one-time concurrent version advance is reconciled without duplicate Stripe sessions or supplier orders',async()=>{
 const base=memorySandboxRunStore();let race=true;
 const store={read:key=>base.read(key),async save(key,row,tag){
  if(row.state==='checking'&&race){race=false;const prior=await base.read(key);await base.save(key,{...prior.record,revision:prior.record.revision+1},prior.etag);throw Error('etag_conflict');}
  return base.save(key,row,tag);
 }};
 const t=sandboxFixture({store});await start(t);t.setPaid();
 const result=await t.service.check(t.owner,t.id);
 assert.equal(result.capturedTestPaymentVerified,true);
 assert.equal(t.calls.create,1);assert.equal(t.calls.retrieve,1);
 assert.equal(result.commercialOrderCreated,false);assert.equal(result.supplierOrderSubmitted,false);
});
test('an overlapping browser check is rejected without losing the first independently verified captured result',async()=>{
 const t=sandboxFixture();await start(t);t.setPaid();
 let entered,release;const inside=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve);
 const original=t.client.checkout.sessions.retrieve;
 t.client.checkout.sessions.retrieve=async(...args)=>{entered();await hold;return original(...args);};
 const first=t.service.check(t.owner,t.id);await inside;
 await assert.rejects(t.service.check(t.owner,t.id),e=>e.status===409&&/already running/.test(e.message));
 assert.equal((await t.service.status(t.owner,t.id)).capturedTestPaymentVerified,false);
 release();const settled=await first;assert.equal(settled.capturedTestPaymentVerified,true);
 assert.equal(settled.supplierOrderSubmitted,false);
});
test('sandbox page loads existing test status without starting a competing verification automatically',()=>{
 const client=fs.readFileSync('assets/stripe-sandbox.js','utf8');
 assert.match(client,/if\(run&&configured\)\{const d=await api\(\{view:'status',id:run\}\);show\(d\);\}/);
 assert.doesNotMatch(client,/if\(!d.expired\)await check\(\)/);
});


test('owner-scoped read-only Stripe probe validates captured test payment without a single ledger write',async()=>{
 const underlying=memorySandboxRunStore();let saves=0;
 const store={read:k=>underlying.read(k),save:async(...args)=>{saves++;return underlying.save(...args);}};
 const t=sandboxFixture({store});await start(t);const savedCount=saves;t.setPaid();
 const result=await t.service.probe(t.owner,t.id);
 assert.equal(result.processorCaptureConfirmed,true);assert.equal(result.marketplaceRecordUpdated,false);
 assert.equal(result.commercialOrderCreated,false);assert.equal(result.commercialOrderPaid,false);
 assert.equal(result.supplierOrderSubmitted,false);assert.equal(result.realSupplierDispatchAllowed,false);
 assert.equal(saves,savedCount);assert.equal(t.calls.retrieve,1);assert.equal(t.calls.intent,1);
 assert.equal((await t.service.status(t.owner,t.id)).state,'open');
 assert.doesNotMatch(JSON.stringify(result),/pi_|cs_test_|sk_test_|whsec_|SECRET_CARD_HINT|billing_details|shipping/);
});
test('read-only Stripe probe works even when the record version cannot be overwritten',async()=>{
 const original=memorySandboxRunStore();
 const store={read:k=>original.read(k),save:async(k,row,tag)=>{
  if(row.state==='checking')throw Error('etag_conflict');
  return original.save(k,row,tag);
 }};
 const t=sandboxFixture({store});await start(t);t.setPaid();
 await assert.rejects(t.service.check(t.owner,t.id),e=>e.status===503);
 const evidence=await t.service.probe(t.owner,t.id);
 assert.equal(evidence.processorCaptureConfirmed,true);assert.equal(evidence.marketplaceRecordUpdated,false);
 assert.equal((await t.service.status(t.owner,t.id)).capturedTestPaymentVerified,false);
});
test('read-only Stripe probe does not approve missing, unpaid, refunded or dispute-held payments',async()=>{
 for(const scenario of ['unpaid','refund','hold']){
  const t=sandboxFixture();await start(t);
  if(scenario!=='unpaid')t.setPaid();
  if(scenario==='refund')t.setRefund();
  if(scenario==='hold')t.setHold();
  const result=await t.service.probe(t.owner,t.id);
  assert.equal(result.processorCaptureConfirmed,false);
  assert.equal(result.supplierOrderSubmitted,false);
  assert.equal((await t.service.status(t.owner,t.id)).capturedTestPaymentVerified,false);
 }
});
test('read-only Stripe probe is owner-scoped and does not query Stripe for another browser',async()=>{
 const t=sandboxFixture();await start(t);
 await assert.rejects(t.service.probe(randomUUID(),t.id),e=>e.status===404);
 assert.equal(t.calls.retrieve,0);assert.equal(t.calls.intent,0);
});
test('sandbox page provides diagnostic proof without presenting it as marketplace ledger approval',()=>{
 const page=stripeSandboxPage(),script=fs.readFileSync('assets/stripe-sandbox.js','utf8');
 assert.match(page,/id="sandbox-probe"/);assert.match(page,/id="sandbox-probe-output"/);
 assert.match(script,/action:'probe'/);
 assert.match(page,/TD purchase order/);
});
test('admin can independently verify an existing Tri-Point Stripe sandbox PaymentIntent with no browser run or saved order writes',async()=>{
 const t=sandboxFixture();await start(t);t.setPaid();
 const before=await t.service.status(t.owner,t.id);
 const paymentId=[...t.sessions.values()][0].payment_intent;
 const r=await t.service.probePayment(paymentId);
 assert.equal(r.readOnly,true);assert.equal(r.processorCaptureConfirmed,true);
 assert.equal(r.marketplaceRecordUpdated,false);assert.equal(r.commercialOrderPaid,false);
 assert.equal(r.supplierOrderSubmitted,false);assert.equal(r.realSupplierDispatchAllowed,false);
 assert.equal(t.calls.create,1);assert.equal(t.calls.intent,1);
 const after=await t.service.status(t.owner,t.id);assert.deepEqual(after,before);
 assert.doesNotMatch(JSON.stringify(r),/pi_|cs_test_|sk_test_|whsec_|SECRET_CARD_HINT|PRIVATE STREET/);
});
test('existing-payment recovery denies absent, forged or mismatched test metadata',async()=>{
 const t=sandboxFixture();await start(t);
 for(const id of ['bad','pi_XYZ','pi_123!'])await assert.rejects(t.service.probePayment(id),e=>e.status===400);
 const paymentId=[...t.sessions.values()][0].payment_intent;
 const session=[...t.sessions.values()][0];session.metadata.tp_quote_digest='not-an-authorized-quote';
 await assert.rejects(t.service.probePayment(paymentId),e=>e.status===400);
 assert.equal((await t.service.status(t.owner,t.id)).capturedTestPaymentVerified,false);
});
test('existing-payment recovery denies refunds and disputes, without supplier release',async()=>{
 for(const scenario of ['refund','dispute']){
  const t=sandboxFixture();await start(t);t.setPaid();
  if(scenario==='refund')t.setRefund();else t.setHold();
  const paymentId=[...t.sessions.values()][0].payment_intent;
  const r=await t.service.probePayment(paymentId);
  assert.equal(r.processorCaptureConfirmed,false);
  assert.equal(r.marketplaceRecordUpdated,false);assert.equal(r.supplierOrderSubmitted,false);
 }
});
test('existing-payment recovery button is independent of missing browser session reference',()=>{
 const page=stripeSandboxPage(),script=fs.readFileSync('assets/stripe-sandbox.js','utf8');
 assert.match(page,/id="sandbox-recover"/);assert.match(page,/id="sandbox-payment-id"/);
 assert.match(page,/id="sandbox-recover-check"/);assert.match(page,/id="sandbox-recover-output"/);
 assert.match(script,/action:'probe-payment'/);
 assert.match(script,/paymentIdOk\(\$\('sandbox-payment-id'\)\.value\.trim\(\)\)/);
 assert.doesNotMatch(script,/!run\|\|.*action:'probe-payment'/);
});
process.env.NODE_ENV='test';process.env.TP_SESSION_SECRET='synthetic-sandbox-test-cookie-secret-no-real-value';
const admin=()=>sign({type:'admin',at:Date.now()});
async function request({method='GET',query='mode=stripe-test&view=configuration',token,owner,origin,input,env={VERCEL_ENV:'preview'}}={}){let calls=0,output='';const handler=createStripeSandboxHandler({env,rate:async()=>{},service:{configuration:()=>({enabled:true}),start:async()=>{calls++;return {mode:'test'};},status:async()=>{calls++;return {mode:'test'};},probePayment:async()=>{calls++;return {readOnly:true,processorCaptureConfirmed:true,marketplaceRecordUpdated:false};}}}),res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v=''){output=v;}};const cookie=[token?'__Host-tp_admin='+token:'',owner?'__Host-tp_stripe_demo='+sign({type:'stripe-demo',id:owner,at:Date.now()}):''].filter(Boolean).join('; ');await handler({method,url:'/api/commerce?'+query,headers:{cookie,...(origin?{origin}:{}),...(input?{'content-type':'application/json'}:{})},body:input},res);return {status:res.statusCode,headers:res.headers,calls,output};}
test('anonymous and contractor sessions cannot create or read Stripe sandbox data',async()=>{for(const token of [undefined,sign({type:'contractor',at:Date.now()})]){const r=await request({token});assert.equal(r.status,401);assert.equal(r.calls,0);}});
test('existing-payment recovery API remains admin-only and CSRF-protected, without a sandbox owner cookie',async()=>{
 const paymentId='pi_SYNTHETIC123456';
 const good=await request({method:'POST',token:admin(),origin:'http://localhost:3000',input:{action:'probe-payment',paymentId}});
 assert.equal(good.status,200);assert.equal(good.calls,1);
 assert.equal(JSON.parse(good.output).marketplaceRecordUpdated,false);
 const anonymous=await request({method:'POST',origin:'http://localhost:3000',input:{action:'probe-payment',paymentId}});
 assert.equal(anonymous.status,401);assert.equal(anonymous.calls,0);
 const crossSite=await request({method:'POST',token:admin(),origin:'https://evil.test',input:{action:'probe-payment',paymentId}});
 assert.equal(crossSite.status,403);assert.equal(crossSite.calls,0);
 const tampered=await request({method:'POST',token:admin(),origin:'http://localhost:3000',input:{action:'probe-payment',paymentId,amount:1}});
 assert.equal(tampered.status,400);assert.equal(tampered.calls,0);
});
test('production always rejects sandbox API even for administrators',async()=>{const r=await request({token:admin(),env:{VERCEL_ENV:'production'}});assert.equal(r.status,503);assert.equal(r.calls,0);});
test('signed owner cookie is HttpOnly Secure and permits Stripe top-level return without exposing credentials',async()=>{const r=await request({token:admin()});assert.equal(r.status,200);assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);assert.match(r.headers['Cache-Control'],/private/);assert.match(r.headers['Cache-Control'],/no-store/);assert.match(r.headers['X-Robots-Tag'],/noindex/);});
test('sandbox writes reject cross-site request or any client-chosen amount/tax fields',async()=>{for(const input of [{action:'start',id:randomUUID(),consent:true,amount:1},{action:'start',id:randomUUID(),consent:true,taxStatus:'exempt'}]){const r=await request({method:'POST',token:admin(),owner:randomUUID(),origin:'http://localhost:3000',input});assert.equal(r.status,400);assert.equal(r.calls,0);}const r=await request({method:'POST',token:admin(),owner:randomUUID(),origin:'https://evil.test',input:{action:'start',id:randomUUID(),consent:true}});assert.equal(r.status,403);});
test('page authentication redirect preserves only a validated test reference',async()=>{const id=randomUUID(),r=await request({query:'mode=stripe-test&view=page&run='+id});assert.equal(r.status,303);assert.equal(r.headers.Location,'/login?next='+encodeURIComponent('/admin/stripe-checkout?run='+id));});
test('test data storage uses private no-cache origin reads and ETag guarded writes',async()=>{const t=sandboxFixture();await start(t);const key=sandboxRunKey(demoEnv.TP_STRIPE_TEST_ACCOUNT_ID,t.id),sample=(await t.store.read(key)).record,calls=[];const store=createSandboxRunStore({env:demoEnv,blob:{get:async(p,opts)=>{calls.push(opts);return {stream:new Response(JSON.stringify(sample)).body,blob:{etag:'v1'}};},put:async(p,s,opts)=>calls.push(opts)}});await store.read(key);await store.save(key,sample,'v1');assert.equal(calls[0].access,'private');assert.equal(calls[0].useCache,false);assert.equal(calls[1].ifMatch,'v1');});
test('Stripe external return has a public data-free same-site hop rather than relaxing Strict admin cookie',async()=>{
 const id=randomUUID();
 const r=await request({query:'mode=stripe-test&view=return&run='+id});
 assert.equal(r.status,200);assert.match(r.headers['Content-Type'],/text\/html/);
 assert.match(r.output,/assets\/stripe-return.js/);
 assert.match(r.output,/does not verify or confirm a payment/);
 assert.doesNotMatch(r.output,/(?:sk_test_|whsec_|pi_|client_secret)/);
 assert.ok(!r.headers['Set-Cookie'],'no new session issued on external redirect');
 const src=fs.readFileSync('assets/stripe-return.js','utf8');
 assert.match(src,/location\.replace\('\/admin\/stripe-checkout\?run='/);
 assert.match(src,/\^\[0-9a-f\]/);
 assert.equal(fs.readFileSync('lib/security.mjs','utf8').includes('SameSite=Strict'),true);
});
test('return hop refuses malformed or duplicate run IDs and never discloses saved record',async()=>{
 for(const query of ['mode=stripe-test&view=return','mode=stripe-test&view=return&run=bad','mode=stripe-test&view=return&run='+randomUUID()+'&run='+randomUUID(),'mode=stripe-test&view=return&run='+randomUUID()+'&url=https://evil.test']){
   const r=await request({query});assert.equal(r.status,400);assert.equal(r.calls,0);
 }
});
test('failed Stripe session read records safe diagnostic stage, not provider credentials or raw message',async()=>{
 const t=sandboxFixture();await start(t);t.setReadError();
 await assert.rejects(t.service.check(t.owner,t.id),e=>e.status===503);
 const row=await t.service.status(t.owner,t.id);
 assert.equal(row.state,'check-failed');assert.ok(row.reasons.includes('processor_recheck_failed'));
 assert.match(row.message,/Stripe Checkout Session retrieval/);
 assert.doesNotMatch(JSON.stringify(row),/PRIVATE FAILED RESPONSE|sk_test_|whsec_|client_secret/);
});
test('failed merchant validation records account stage without accepting customer payment',async()=>{
 const t=sandboxFixture();await start(t);t.setWrongAccount();
 await assert.rejects(t.service.check(t.owner,t.id),e=>e.status===503);
 const row=await t.service.status(t.owner,t.id);
 assert.match(row.message,/Stripe account check/);assert.equal(row.capturedTestPaymentVerified,false);
});
test('new hosted Session URLs return via the data-free same-site hop',async()=>{
 const t=sandboxFixture();await start(t);
 const sess=[...t.sessions.values()][0];
 assert.match(sess.success_url,/\/admin\/stripe-return\?run=/);
 assert.match(sess.cancel_url,/\/admin\/stripe-return\?run=/);
 assert.doesNotMatch(sess.success_url,/x-vercel-protection-bypass/);
});
