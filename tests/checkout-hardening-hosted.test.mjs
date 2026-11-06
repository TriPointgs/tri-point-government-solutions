// Explicit opt-in: actual Blob persistence, injected synthetic Stripe/TD/tax only.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {get,put,head,del} from '@vercel/blob';
import {createFinalOrderStore} from '../lib/final-order-store.mjs';
import {createCheckoutSessionStore} from '../lib/stripe-checkout-session.mjs';
import {createPaymentVerificationStore} from '../lib/payment-verification-store.mjs';
import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {env as baseEnv} from './payment-first-fixture.mjs';
const enabled=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&process.env.TP_BLOB_STORAGE_CANARY==='diagnose';
test('opt-in checkout lifecycle, lost-save and owner-session recovery persist on real Blob',{skip:!enabled,timeout:60000},async()=>{
 const root='preview/checkout-hardening-canary/v1/'+randomUUID()+'/',paths=new Set(),env={...baseEnv,TP_TEST_ORDER_FINALIZATION_ENABLED:'true'};
 const report={realBlob:true,syntheticProviders:true,node:process.versions.node,builtinUndici:process.versions.undici,expirySaved:false,failedCheckCleared:false,lostSessionRecovered:false,administratorRecovered:false,pausedCreationReadable:false,cleanup:false};
 async function build(tag,{loseSave=false}={}){let reject=loseSave;const location=p=>{assert.match(p,/^preview\/(final-orders|stripe-checkout-sessions|captured-payment-tests)\/v1\//);return root+tag+'-'+createHash('sha256').update(p).digest('hex')+'.json';};
  const blob={get:(p,o)=>get(location(p),o),put:async(p,b,o)=>{if(reject&&p.startsWith('preview/stripe-checkout-sessions/')&&JSON.parse(b).state==='open')throw Error('synthetic lost Session save');const loc=location(p);paths.add(loc);return put(loc,b,o);}};
  const t=await cartPaymentFixture({orderStore:createFinalOrderStore({env,blob}),checkoutStore:createCheckoutSessionStore({env,blob}),paymentStore:createPaymentVerificationStore({env,blob})});return {t,allow:()=>{reject=false;}};
 }
 try{
  const {t:a}=await build('expiry'),ao=await a.finalize();await a.service.open(a.owner,{orderId:ao.id,testConsent:true});a.env.TP_STRIPE_TEST_CHECKOUT_EXPIRY_ENABLED='true';a.client.checkout.sessions.expire=async()=>{a.setSessionPatch({status:'expired',payment_status:'unpaid',url:null});return {};};const closed=await a.service.closeCheckout(a.owner,{orderId:ao.id,closeConsent:true});report.expirySaved=closed.checkoutClosed&&(await a.service.read(a.owner,ao.id)).status==='checkout-expired'&&a.counts.create===1;
  const {t:b}=await build('failure'),bo=await b.finalize();await b.service.open(b.owner,{orderId:bo.id,testConsent:true});b.paid();await b.service.reconcile(b.owner,{orderId:bo.id});const getSession=b.client.checkout.sessions.retrieve;b.client.checkout.sessions.retrieve=async()=>{throw Error('synthetic Session read timeout');};await assert.rejects(b.service.reconcile(b.owner,{orderId:bo.id}));report.failedCheckCleared=(await b.service.read(b.owner,bo.id)).captureConfirmed===false;b.client.checkout.sessions.retrieve=getSession;b.env.TP_CART_CHECKOUT_PREVIEW_ENABLED='false';report.pausedCreationReadable=(await b.service.history(b.owner)).records.length===1;report.administratorRecovered=(await b.service.administratorReconcile({orderId:bo.id,recoveryConsent:true})).captureConfirmed===true;
  const {t:c,allow}=await build('lost',{loseSave:true}),co=await c.finalize();await assert.rejects(c.service.open(c.owner,{orderId:co.id,testConsent:true}));allow();c.paid();c.advance(900001);const event=c.event();await c.service.receive(event.raw,event.signature);const recovered=await c.service.administratorRead(co.id);report.lostSessionRecovered=recovered.captureConfirmed&&recovered.paymentGatePassed===false&&recovered.status==='captured-review-required'&&c.counts.create===1;
 }finally{
  let clean=true;for(const path of paths){try{await del(path,{ifMatch:(await head(path)).etag});if(await get(path,{access:'private',useCache:false}))clean=false;}catch{try{if(await get(path,{access:'private',useCache:false}))clean=false;}catch{clean=false;}}}report.cleanup=clean;console.info('TP_CHECKOUT_HARDENING_CANARY',JSON.stringify(report));
 }
 for(const key of ['expirySaved','failedCheckCleared','lostSessionRecovered','administratorRecovered','pausedCreationReadable','cleanup'])assert.equal(report[key],true,key);
});
