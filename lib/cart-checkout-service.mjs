// Private merchant TEST integration. No live payment, email, refund or TD dispatcher.
import {HttpError} from './model.mjs';
import {cartId} from './shop-cart-store.mjs';
import {createShopService} from './shop-cart-service.mjs';
import {createOrderFinalization} from './checkout-finalization.mjs';
import {createFinalOrderStore,createFinalizationPolicyReader} from './final-order-store.mjs';
import {createStripeTaxQuote} from './stripe-tax-quote.mjs';
import {createStripeCheckoutSessionBridge,createCheckoutSessionStore} from './stripe-checkout-session.mjs';
import {createStripePaymentVerifier} from './stripe-payment-verifier.mjs';
import {createPaymentVerificationService} from './payment-verification-service.mjs';
import {createPaymentVerificationStore} from './payment-verification-store.mjs';
const fail=(m,status=409)=>{throw new HttpError(status,m);};
const fields=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('Unexpected checkout fields. Client totals or payment flags are not accepted.',400);};
export function createCartCheckoutService({env=process.env,shop=createShopService({env}),orders=createFinalOrderStore({env}),policies=createFinalizationPolicyReader({env}),tax=createStripeTaxQuote({env}),client=null,verifier=createStripePaymentVerifier({env,client}),checkoutStore=createCheckoutSessionStore({env}),paymentStore=createPaymentVerificationStore({env}),clock=()=>Date.now()}={}){
 const finalizer=createOrderFinalization({env,shop,policies,tax,store:orders,clock}),orderSource=finalizer.paymentOrderStore();
 const bridge=createStripeCheckoutSessionBridge({env,stripeClient:client,orderStore:orderSource,store:checkoutStore,clock,integrated:true});
 const payments=createPaymentVerificationService({env,verifier,store:paymentStore,clock});
 const enabled=()=>env.VERCEL_ENV==='preview'&&env.TP_CART_CHECKOUT_PREVIEW_ENABLED==='true';
 const guard=()=>{if(!enabled())fail('Integrated cart checkout is not enabled for this private preview.',503);};
 const project=(order,p={})=>{const matched=p.matched===true,captured=p.captureConfirmed===true,passed=p.paymentGatePassed===true;
  return {...order,status:captured?(passed?'test-payment-verified':'captured-review-required'):matched?'payment-needs-recheck':order.status,
   captureConfirmed:captured,paymentGatePassed:passed,paymentVerifiedAt:p.verifiedAt||null,paymentRecordSaved:matched,
   paymentReasons:[...(p.reasons||[]),...(p.quoteExpired?['order_requote_required']:[])],canPay:false,liveCheckoutEnabled:false,
   supplierOrderSubmitted:false,realSupplierDispatchAllowed:false,emailSent:false,inventoryReserved:false};};
 const read=async(owner,id)=>{guard();const order=await finalizer.readOrder(owner,id);return project(order,await payments.inspectOrder(id));};
 async function bind(orderId,proof){const order=await orderSource.get(orderId);if(!order)fail('Finalized order not found.',404);await payments.bindCheckoutOrder(order,proof);}
 return {
  async configuration(){const blockers=[];if(!enabled())blockers.push('Private cart checkout activation is off.');if(!finalizer.configuration().enabled)blockers.push('Server order finalization is not enabled.');if(!bridge.configuration().enabled)blockers.push('Product-linked Stripe TEST Checkout is not enabled.');if(!tax.configuration().enabled)blockers.push('Reviewed tax setup and test tax calculation are required.');let terms=null;
   if(finalizer.configuration().enabled){try{terms=await finalizer.checkoutTerms();}catch(e){blockers.push(e instanceof HttpError?e.message:'Approved merchant purchase and shipping policies could not be read.');}}
   else blockers.push('Approved purchase terms, shipping policy and exact product tax classifications must be supplied.');
   return {mode:'test',ready:blockers.length===0,blockers,terms,liveCheckoutEnabled:false,supplierOrderingEnabled:false};
  },
  async finalize(owner,input){guard();fields(input,['reviewId','termsVersion','termsDigest','termsAccepted','testConsent']);if(input.testConsent!==true)fail('Confirm this private sandbox-only order test.',400);
   const config=await this.configuration();if(!config.ready)fail(config.blockers.join(' '),503);
   if(input.termsVersion!==config.terms.version||input.termsDigest!==config.terms.digest||input.termsAccepted!==true)fail('Review and accept the exact approved purchase terms.',400);
   const {testConsent,...request}=input,result=await finalizer.finalize(owner,request);return read(owner,result.id);
  },
  read,
  async open(owner,input){guard();fields(input,['orderId','testConsent']);if(input.testConsent!==true)fail('Confirm opening Stripe TEST Checkout; no real purchase is allowed.',400);cartId(input.orderId);
   const order=await finalizer.readOrder(owner,input.orderId);if(order.needsRecheck)fail('This order quote expired. Reconcile any existing payment; do not pay again.');
   const config=await this.configuration();if(!config.ready)fail(config.blockers.join(' '),503);
   await finalizer.assertCheckoutReady(owner,order.id);
   const seen=await bridge.inspectSaved(order.id);
   if(seen.state==='paid-session')return this.reconcile(owner,{orderId:order.id});
   if(seen.state==='open'){if(!seen.url)fail('Stripe did not return a valid resumable link.',503);return {...await read(owner,order.id),checkoutURL:seen.url,checkoutState:'open',duplicate:true};}
   if(!['not-started','creating'].includes(seen.state))fail('This existing checkout needs reconciliation. Do not make another payment.');
   const started=await bridge.begin(order.id);return {...await read(owner,order.id),checkoutURL:started.url,checkoutState:started.state,duplicate:started.duplicate};
  },
  async reconcile(owner,input){guard();fields(input,['orderId']);const order=await finalizer.readOrder(owner,input.orderId),seen=await bridge.inspectSaved(order.id);
   if(seen.state==='paid-session'){await bind(order.id,seen.proof);await payments.recheckBoundPayment(seen.proof.paymentId);}
   return {...await read(owner,order.id),checkoutState:seen.state};
  },
  // Signed provider delivery can recover a completed Session BEFORE a browser returns.
  // Unknown external payments do not manufacture an order or a binding.
  async receive(raw,signature){
   if(env.VERCEL_ENV!=='preview')return payments.receive(raw,signature);
   const event=verifier.parseEvent(raw,signature);if(!event||event.sandboxDemoId)return payments.receive(raw,signature);
   const paymentId=await verifier.eventPaymentId(event),prior=await payments.inspect(paymentId);
   if(!prior.matched){const link=await verifier.checkoutOrder(event);if(!link)return payments.receive(raw,signature);
    const record=await orders.read(link.orderId);if(!record||record.record.phase!=='finalized')return {received:true,matched:false,realSupplierDispatchAllowed:false};
    const seen=await bridge.inspectSaved(link.orderId);if(seen.state!=='paid-session')fail('Saved checkout is not ready for event reconciliation. Retry this signed event.',409);
    if(seen.proof.paymentId!==paymentId)fail('Signed event belongs to a different Checkout payment.',409);await bind(link.orderId,seen.proof);
   }
   return payments.receive(raw,signature);
  }
 };
}
