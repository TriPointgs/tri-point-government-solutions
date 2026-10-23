import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkoutSessionPlan,checkoutSessionKey,createCheckoutSessionStore,memoryCheckoutSessionStore,createStripeCheckoutSessionBridge} from '../lib/stripe-checkout-session.mjs';
import {finalOrder,env as fixtureEnv,now} from './payment-first-fixture.mjs';
import {bindingForFinalOrder} from '../lib/payment-release-policy.mjs';
const env={...fixtureEnv,TP_STRIPE_TEST_CHECKOUT_ENABLED:'true',VERCEL_BRANCH_URL:'tri-point-government-solutions-git-feature-td-edc7b1-tri-point.vercel.app'};
const origin='https://'+env.VERCEL_BRANCH_URL;
function order(){return {...finalOrder(),lines:[{...finalOrder().lines[0],description:'Synthetic TPGS Notebook'}]};}
function setup({o=order(),store=memoryCheckoutSessionStore(),config=env,nowMs=now,clientBehavior={}}={}){
 const calls={account:0,create:0,retrieve:0},client={accounts:{async retrieve(){calls.account++;return clientBehavior.account||{id:config.TP_STRIPE_TEST_ACCOUNT_ID};}},checkout:{sessions:{
  async create(args,opts){calls.create++;if(clientBehavior.createError)throw Error('PRIVATE PROCESSOR FAILURE');const plan=checkoutSessionPlan(o,{accountId:config.TP_STRIPE_TEST_ACCOUNT_ID,origin,now:nowMs});return {...plan,object:'checkout.session',id:'cs_test_SYNTHETIC12345678',url:'https://checkout.stripe.com/c/pay/testexample',livemode:false,mode:'payment',client_reference_id:o.id,payment_status:'unpaid',status:'open',currency:'usd',amount_total:o.totalCents,metadata:args.metadata,...clientBehavior.session};},
  async retrieve(id){calls.retrieve++;return {id,client_reference_id:o.id,livemode:false,mode:'payment',payment_status:'paid',status:'complete',currency:'usd',amount_total:o.totalCents,metadata:{tp_order_id:o.id,tp_order_version:String(o.version),tp_quote_digest:checkoutSessionPlan(o,{accountId:config.TP_STRIPE_TEST_ACCOUNT_ID,origin,now:Math.min(nowMs,Date.parse(o.quoteExpiresAt)-400000)}).binding.quoteDigest},payment_intent:'pi_SYNTHETIC12345678',...clientBehavior.retrieved};}
 }}};
 const orderStore={async get(id){return id===o.id?structuredClone(o):null;}};
 const bridge=createStripeCheckoutSessionBridge({env:config,orderStore,store,stripeClient:client,clock:()=>nowMs});
 return {bridge,calls,store,o,client};
}
test('session creation plans only use exact server-finalized price, shipping and documented tax evidence',()=>{
 const o=order(),p=checkoutSessionPlan(o,{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now});
 assert.equal(p.amountCents,24250);
 assert.equal(p.params.line_items.length,2);
 assert.equal(p.params.line_items[0].quantity,2);
 assert.equal(p.params.line_items[0].price_data.unit_amount,11500);
 assert.equal(p.params.line_items[1].price_data.unit_amount,1250);
 assert.equal(p.params.payment_intent_data.metadata.tp_quote_digest,p.binding.quoteDigest);
 assert.equal(p.params.client_reference_id,o.id);
 assert.equal(p.params.automatic_tax.enabled,false);
 assert.equal(p.params.success_url,origin+'/shop-preview?payment_status=check&session_id={CHECKOUT_SESSION_ID}');
 assert.ok(!Object.hasOwn(p.params,'payment_method_types'),'Newer Stripe API versions reject explicit payment_method_types');
 assert.ok(!Object.hasOwn(p.params,'capture_method'));
 assert.doesNotMatch(JSON.stringify(p.params),/sk_test_|whsec_|costCents|distributorCost|bankAccount|ssn/i);
});
test('zero or non-zero verified tax is represented once with the correct final total',()=>{
 const o=order();o.taxCents=2300;o.taxStatus='calculated';o.totalCents+=2300;
 const p=checkoutSessionPlan(o,{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now});
 assert.equal(p.params.line_items.length,3);
 assert.equal(p.params.line_items.at(-1).price_data.unit_amount,2300);
 assert.equal(p.params.line_items.reduce((s,x)=>s+x.price_data.unit_amount*x.quantity,0),o.totalCents);
});
test('cart reviews and browser-paid objects cannot be used as payable Stripe orders',()=>{
 const o=order();
 for(const bad of [{...o,kind:'review'}, {...o,status:'cart'}, {...o,mode:'production'}, {...o,holds:['tax pending']},{...o,taxStatus:'unknown'}, {...o,taxEvidence:null}, {...o,termsVersion:null},{...o,totalCents:0},{...o,shippingCents:null}])
  assert.throws(()=>checkoutSessionPlan(bad,{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now}),{status:400});
});
test('expired quotes and almost-expired quotes cannot open a long-lived Stripe Checkout session',()=>{
 const o=order();
 assert.throws(()=>checkoutSessionPlan({...o,quoteExpiresAt:new Date(now+60000).toISOString()},{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now}),e=>e.status===409);
 assert.throws(()=>checkoutSessionPlan(o,{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now:now+900001}));
});
test('malicious origin and merchant account values are rejected before provider calls',()=>{
 for(const bad of ['https://tripointgs.com','https://evil.test','http://preview.vercel.app','https://evil.vercel.app/path','https://attacker.vercel.app@evil.test'])
  assert.throws(()=>checkoutSessionPlan(order(),{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin:bad,now}),e=>e.status===400);
 assert.throws(()=>checkoutSessionPlan(order(),{accountId:'acct_bad?x',origin,now}));
});
test('session idempotency is tied to immutable order, version and quote digest',()=>{
 const o=order(),one=checkoutSessionPlan(o,{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now});
 assert.equal(one.idempotencyKey,checkoutSessionPlan(o,{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now}).idempotencyKey);
 assert.notEqual(one.idempotencyKey,checkoutSessionPlan({...o,id:randomUUID()},{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now}).idempotencyKey);
 assert.notEqual(one.idempotencyKey,checkoutSessionPlan({...o,version:2},{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now}).idempotencyKey);
});
test('production, disabled Checkout flag or missing payment configuration fails before provider calls and storage',async()=>{
 for(const patch of [{VERCEL_ENV:'production'},{TP_STRIPE_TEST_CHECKOUT_ENABLED:'false'},{TP_STRIPE_TEST_READS_ENABLED:'false'},{TP_STRIPE_TEST_SECRET_KEY:''}]){
  const t=setup({config:{...env,...patch}});
  assert.equal(t.bridge.configuration().enabled,false);
  await assert.rejects(t.bridge.begin(t.o.id),e=>e.status===503);
  assert.equal(t.calls.create,0);assert.equal((await t.store.read(checkoutSessionKey(env.TP_STRIPE_TEST_ACCOUNT_ID,t.o.id))),null);
 }
});
test('does not accept a browser-provided final order; order lookup is server controlled',async()=>{
 const t=setup();await assert.rejects(t.bridge.begin(randomUUID()),e=>e.status===404);
 assert.equal(t.calls.create,0);
});
test('a sandbox account mismatch blocks session creation',async()=>{
 const t=setup({clientBehavior:{account:{id:'acct_WRONG9999'}}});
 await assert.rejects(t.bridge.begin(t.o.id),e=>e.status===503);
 assert.equal(t.calls.create,0);
});
test('successful Checkout creation only returns Stripe-hosted URL and not proof of payment or supplier submission',async()=>{
 const t=setup(),r=await t.bridge.begin(t.o.id);
 assert.equal(r.state,'open');assert.equal(r.verifiedCaptured,false);assert.equal(r.customerPaid,false);assert.equal(r.supplierOrderSubmitted,false);
 assert.equal(r.url,'https://checkout.stripe.com/c/pay/testexample');
 assert.equal(t.calls.create,1);
});
test('retry with same finalized order returns existing session without a second provider call',async()=>{
 const t=setup(),first=await t.bridge.begin(t.o.id),second=await t.bridge.begin(t.o.id);
 assert.equal(first.sessionId,second.sessionId);assert.equal(second.duplicate,true);assert.equal(t.calls.create,1);
});
test('uncertain provider create response uses same deterministic Stripe idempotency key on retry',async()=>{
 const t=setup({clientBehavior:{createError:true}});
 await assert.rejects(t.bridge.begin(t.o.id),e=>e.status===503);
 assert.equal(t.calls.create,1);
 t.client.checkout.sessions.create=async(args,options)=>{
   t.calls.create++;assert.match(options.idempotencyKey,/^tp-sandbox-checkout-/);
   return {id:'cs_test_SYNTHETIC12345678',url:'https://checkout.stripe.com/c/pay/testexample',livemode:false,mode:'payment',client_reference_id:t.o.id,payment_status:'unpaid',status:'open',currency:'usd',amount_total:t.o.totalCents,metadata:args.metadata};
 };
 const r=await t.bridge.begin(t.o.id);assert.equal(r.state,'open');assert.equal(t.calls.create,2);
});
test('malformed/mismatched Stripe Checkout responses are blocked and not redirected to a foreign site',async()=>{
 for(const session of [{url:'https://evil.example/payment'},{livemode:true},{amount_total:1},{currency:'eur'},{client_reference_id:randomUUID()},{payment_status:'paid'},{metadata:{tp_quote_digest:'bad'}},{id:'cs_live_FORBIDDEN'}]){
  const t=setup({clientBehavior:{session}});
  await assert.rejects(t.bridge.begin(t.o.id),e=>e.status===503);
 }
});
test('a saved order with changed amount cannot silently reuse a prior Stripe session',async()=>{
 let o=order();const store=memoryCheckoutSessionStore(),t=setup({o,store});await t.bridge.begin(o.id);
 const changed={...o,unitPriceCents:12000,lines:[{...o.lines[0],unitPriceCents:12000}],subtotalCents:24000,totalCents:25250};
 const next=setup({o:changed,store});await assert.rejects(next.bridge.begin(o.id),e=>e.status===409);assert.equal(next.calls.create,0);
});
test('binding reconciliation rejects an unpaid or mismatched session before touching payment ledger',async()=>{
 for(const mismatch of [{payment_status:'unpaid'},{amount_total:1},{client_reference_id:randomUUID()},{metadata:{tp_quote_digest:'bad'}},{livemode:true},{payment_intent:'pi_invalid!'}]){
  const t=setup({clientBehavior:{retrieved:mismatch}});await t.bridge.begin(t.o.id);let calls=0;
  await assert.rejects(t.bridge.reconcilePaid(t.o.id,{paymentService:{async bindFinalOrder(){calls++;},async recheckBoundPayment(){calls++;}}}),e=>e.status===409||e.status===400);
  assert.equal(calls,0);
 }
});
test('actual captured-payment state comes only from server recheck, never from redirect or session paid field alone',async()=>{
 const t=setup();await t.bridge.begin(t.o.id);
 let bindingCalls=0,verificationCalls=0;
 const r=await t.bridge.reconcilePaid(t.o.id,{paymentService:{
  async bindFinalOrder(o,id){bindingCalls++;assert.equal(o.id,t.o.id);assert.equal(id,'pi_SYNTHETIC12345678');},
  async recheckBoundPayment(id){verificationCalls++;return {paymentGatePassed:false,reasons:['charge_not_captured']};}
 }});
 assert.equal(bindingCalls,1);assert.equal(verificationCalls,1);assert.equal(r.customerPaid,false);assert.equal(r.realSupplierDispatchAllowed,false);
});
test('strict payment verifier can report captured test evidence but still never allow TD ordering',async()=>{
 const t=setup();await t.bridge.begin(t.o.id);
 const r=await t.bridge.reconcilePaid(t.o.id,{paymentService:{async bindFinalOrder(){},async recheckBoundPayment(){return {paymentGatePassed:true,reasons:[]};}}});
 assert.equal(r.verifiedCaptured,true);assert.equal(r.realSupplierDispatchAllowed,false);assert.equal(r.mode,'test');
});
test('supplier quote expiration blocks binding even if Stripe says the session was paid',async()=>{
 const t=setup({nowMs:now+900001});
 // Begin requires at least five minutes remaining, so use an earlier clock for initial session,
 // and a new bridge observing the same durable stored record for the later time.
 const first=setup({o:t.o,store:t.store,nowMs:now});await first.bridge.begin(t.o.id);
 await assert.rejects(t.bridge.reconcilePaid(t.o.id,{paymentService:{async bindFinalOrder(){throw Error('SHOULD NOT');},async recheckBoundPayment(){throw Error('SHOULD NOT');}}}),e=>e.status===400);
});
test('private checkout store never reads or writes Stripe session data in production',async()=>{
 const store=createCheckoutSessionStore({env:{VERCEL_ENV:'production'},blob:{get:async()=>{throw Error('called');},put:async()=>{throw Error('called');}}}),key='a'.repeat(64);
 await assert.rejects(store.read(key),e=>e.status===503);
 await assert.rejects(store.save(key,{mode:'test',schemaVersion:1,key,state:'creating'},null),e=>e.status===503);
});
test('session does not add Stripe live keys or customer PII to the source checkout request',()=>{
 const plan=checkoutSessionPlan(order(),{accountId:env.TP_STRIPE_TEST_ACCOUNT_ID,origin,now});
 const source=JSON.stringify(plan.params);
 assert.doesNotMatch(source,/(?:street|buyerEmail|ssn|sk_live_|sk_test_|whsec_|x-vercel-protection-bypass)/i);
});
