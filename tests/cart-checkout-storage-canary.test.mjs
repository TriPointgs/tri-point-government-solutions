// Explicitly gated disposable storage test. Stripe and TD are injected fixtures;
// real provider calls cannot be made by this fixture. No existing record is read.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {get,put,head,del} from '@vercel/blob';
import {createFinalOrderStore} from '../lib/final-order-store.mjs';
import {createCheckoutSessionStore} from '../lib/stripe-checkout-session.mjs';
import {createPaymentVerificationStore} from '../lib/payment-verification-store.mjs';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {env as baseEnv} from './payment-first-fixture.mjs';
const enabled=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&process.env.TP_BLOB_STORAGE_CANARY==='diagnose';
test('gated real-Blob full cart checkout and late-payment persistence with synthetic providers',{skip:!enabled,timeout:45000},async()=>{
 const prefix='preview/cart-checkout-canary/v1/'+randomUUID()+'/',paths=new Set(),env={...baseEnv,TP_TEST_ORDER_FINALIZATION_ENABLED:'true'};
 const path=p=>{assert.match(p,/^preview\/(?:final-orders|stripe-checkout-sessions|captured-payment-tests)\/v1\//);return prefix+createHash('sha256').update(p).digest('hex')+'.json';};
 const blob={get:(p,o)=>get(path(p),o),put:async(p,b,o)=>{const k=path(p);paths.add(k);return put(k,b,o);}};
 const report={realBlob:true,syntheticStripe:true,syntheticTD:true,finalOrderSaved:false,paymentSaved:false,webhookBeforeReturn:false,lateHoldSaved:false,retrySafe:false,cleanup:false};
 try{
  const options={orderStore:createFinalOrderStore({env,blob}),checkoutStore:createCheckoutSessionStore({env,blob}),paymentStore:createPaymentVerificationStore({env,blob})};
  const t=await cartPaymentFixture(options),o=await t.finalize();report.finalOrderSaved=(await t.service.read(t.owner,o.id)).totalCents===25750;
  await t.service.open(t.owner,{orderId:o.id,testConsent:true});t.paid();const e=t.event();const eventResult=await t.service.receive(e.raw,e.signature);report.webhookBeforeReturn=eventResult.paymentGatePassed===true;
  const read=await t.service.read(t.owner,o.id);report.paymentSaved=read.paymentRecordSaved&&read.captureConfirmed&&read.realSupplierDispatchAllowed===false;
  const retry=await t.service.reconcile(t.owner,{orderId:o.id});report.retrySafe=retry.captureConfirmed&&t.counts.create===1;
  t.advance(900001);const late=await t.service.reconcile(t.owner,{orderId:o.id}),again=await t.service.read(t.owner,o.id);
  report.lateHoldSaved=late.captureConfirmed&&late.paymentGatePassed===false&&again.status==='captured-review-required'&&again.supplierOrderSubmitted===false;
 }finally{
  let clean=true;for(const p of paths){try{const metadata=await head(p);await del(p,{ifMatch:metadata.etag});if(await get(p,{access:'private',useCache:false}))clean=false;}catch{try{if(await get(p,{access:'private',useCache:false}))clean=false;}catch{clean=false;}}}report.cleanup=clean;
  console.info('TP_CART_CHECKOUT_STORAGE_TEST',JSON.stringify(report));
 }
 for(const k of ['finalOrderSaved','paymentSaved','webhookBeforeReturn','lateHoldSaved','retrySafe','cleanup'])assert.equal(report[k],true,k);
});
