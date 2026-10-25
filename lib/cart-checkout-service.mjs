// Private merchant TEST integration. No live payment, email, refund or TD dispatcher.
import {HttpError} from './model.mjs';
import {cartId} from './shop-cart-store.mjs';
import {createShopService} from './shop-cart-service.mjs';
import {createOrderFinalization} from './checkout-finalization.mjs';
import {createFinalOrderStore,createFinalizationPolicyReader} from './final-order-store.mjs';
import {createStripeTaxQuote} from './stripe-tax-quote.mjs';
import {createStripeCheckoutSessionBridge,createCheckoutSessionStore} from './stripe-checkout-session.mjs';
import {createStripePaymentVerifier,stripeTestConfiguration} from './stripe-payment-verifier.mjs';
import {createPaymentVerificationService} from './payment-verification-service.mjs';
import {createPaymentVerificationStore} from './payment-verification-store.mjs';
import {createCartOrderHistoryStore} from './cart-order-history.mjs';
const fail=(m,status=409)=>{throw new HttpError(status,m);};
const fields=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('Unexpected checkout fields. Client totals or payment flags are not accepted.',400);};
export function createCartCheckoutService({env=process.env,shop=createShopService({env}),orders=createFinalOrderStore({env}),policies=createFinalizationPolicyReader({env}),tax=createStripeTaxQuote({env}),client=null,verifier=createStripePaymentVerifier({env,client}),checkoutStore=createCheckoutSessionStore({env}),paymentStore=createPaymentVerificationStore({env}),history=createCartOrderHistoryStore({env}),clock=()=>Date.now()}={}){
 const finalizer=createOrderFinalization({env,shop,policies,tax,store:orders,clock}),orderSource=finalizer.paymentOrderStore();
 const bridge=createStripeCheckoutSessionBridge({env,stripeClient:client,orderStore:orderSource,store:checkoutStore,clock,integrated:true});
 const payments=createPaymentVerificationService({env,verifier,store:paymentStore,clock});
 const enabled=()=>env.VERCEL_ENV==='preview'&&env.TP_CART_CHECKOUT_PREVIEW_ENABLED==='true';
 const guard=()=>{if(!enabled())fail('Integrated cart checkout is not enabled for this private preview.',503);};
 const readable=()=>env.VERCEL_ENV==='preview'&&finalizer.configuration().enabled&&stripeTestConfiguration(env).configured;
 const readGuard=()=>{if(!readable())fail('Private saved-order verification is unavailable.',503);};
 const project=(order,p={},session={})=>{const matched=p.matched===true,captured=p.captureConfirmed===true,passed=p.paymentGatePassed===true;
  return {...order,status:captured?(passed?'test-payment-verified':'captured-review-required'):matched?'payment-needs-recheck':session.state==='expired'?'checkout-expired':session.state==='needs-review'?'checkout-needs-review':session.state==='creating'?'checkout-creation-uncertain':order.status,
   checkoutState:session.state||'not-started',checkoutObservedAt:session.checkedAt||null,
   captureConfirmed:captured,paymentGatePassed:passed,paymentVerifiedAt:p.verifiedAt||null,paymentRecordSaved:matched,
   paymentReasons:[...(p.reasons||[]),...(p.quoteExpired?['order_requote_required']:[])],canPay:false,liveCheckoutEnabled:false,
   supplierOrderSubmitted:false,realSupplierDispatchAllowed:false,emailSent:false,inventoryReserved:false};};
 const read=async(owner,id)=>{readGuard();const order=await finalizer.readOrder(owner,id);return project(order,await payments.inspectOrder(id),await bridge.savedState(id));};
 async function bind(orderId,proof){const order=await orderSource.get(orderId);if(!order)fail('Finalized order not found.',404);await payments.bindCheckoutOrder(order,proof);}
 return {
  async configuration(){const blockers=[];if(!enabled())blockers.push('Private cart checkout activation is off.');if(!finalizer.configuration().enabled)blockers.push('Server order finalization is not enabled.');if(!bridge.configuration().enabled)blockers.push('Product-linked Stripe TEST Checkout is not enabled.');if(!tax.configuration().enabled)blockers.push('Reviewed tax setup and test tax calculation are required.');let terms=null;
   if(finalizer.configuration().enabled){try{terms=await finalizer.checkoutTerms();}catch(e){blockers.push(e instanceof HttpError?e.message:'Approved merchant purchase and shipping policies could not be read.');}}
   else blockers.push('Approved purchase terms, shipping policy and exact product tax classifications must be supplied.');
   return {mode:'test',ready:blockers.length===0,historyReady:readable(),expiryEnabled:readable()&&env.TP_STRIPE_TEST_CHECKOUT_EXPIRY_ENABLED==='true',blockers,terms,liveCheckoutEnabled:false,supplierOrderingEnabled:false};
  },
  async history(owner,cursor){readGuard();cartId(owner);const page=await history.page(owner,cursor),ordersPage=[];
   for(const pointer of page.records){const source=await orders.read(pointer.orderId);if(!source||source.record.owner!==owner||source.record.phase!=='finalized'||source.record.reviewId!==pointer.reviewId||source.record.completedAt!==pointer.createdAt)fail('An indexed test order cannot be verified. No payment status is inferred.',503);
    const order=await finalizer.readOrder(owner,pointer.orderId),payment=await payments.inspectOrder(pointer.orderId),item=project(order,payment,await bridge.savedState(pointer.orderId));
    ordersPage.push({id:item.id,reference:item.reference,status:item.status,totalCents:item.totalCents,currency:'USD',createdAt:pointer.createdAt,quoteExpiresAt:item.quoteExpiresAt,captureConfirmed:item.captureConfirmed,paymentGatePassed:item.paymentGatePassed,supplierOrderSubmitted:false});}
   return {mode:'test',records:ordersPage,hasMore:page.hasMore,cursor:page.cursor,realSupplierDispatchAllowed:false};
  },
  async finalize(owner,input){guard();fields(input,['reviewId','termsVersion','termsDigest','termsAccepted','testConsent']);if(input.testConsent!==true)fail('Confirm this private sandbox-only order test.',400);
   const config=await this.configuration();if(!config.ready)fail(config.blockers.join(' '),503);
   if(input.termsVersion!==config.terms.version||input.termsDigest!==config.terms.digest||input.termsAccepted!==true)fail('Review and accept the exact approved purchase terms.',400);
   const {testConsent,...request}=input,result=await finalizer.finalize(owner,request);
   const durable=await orders.read(result.id);if(!durable||durable.record.phase!=='finalized'||durable.record.owner!==owner||durable.record.reviewId!==input.reviewId)fail('The saved order cannot be confirmed for indexing.',503);
   try{await history.save(owner,{id:result.id,reviewId:durable.record.reviewId,createdAt:durable.record.completedAt});}
   catch{fail('The test order was saved, but order history could not be indexed. Retry the SAME review; do not create another payment.',503);}
   return read(owner,result.id);
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
  async reconcile(owner,input){readGuard();fields(input,['orderId']);const order=await finalizer.readOrder(owner,input.orderId);
   try{const seen=await bridge.inspectSaved(order.id);
    if(seen.state==='paid-session'){await bind(order.id,seen.proof);await payments.recheckBoundPayment(seen.proof.paymentId);}
    else await payments.invalidateOrderCheck(order.id);
    return {...await read(owner,order.id),checkoutState:seen.state};
   }catch(e){await payments.invalidateOrderCheck(order.id);throw e;}
  },
  // Routed only after requireAdmin; no browser owner is accepted from this input.
  async administratorRead(orderId){readGuard();cartId(orderId);const row=await orders.read(orderId);if(!row||row.record.phase!=='finalized')fail('Saved test order not found.',404);return read(row.record.owner,orderId);},
  async administratorReconcile(input){readGuard();fields(input,['orderId','recoveryConsent']);if(input.recoveryConsent!==true)fail('Confirm verification of this exact existing sandbox payment record.',400);cartId(input.orderId);const row=await orders.read(input.orderId);if(!row||row.record.phase!=='finalized')fail('Saved test order not found.',404);return this.reconcile(row.record.owner,{orderId:input.orderId});},
  async closeCheckout(owner,input){readGuard();fields(input,['orderId','closeConsent']);if(input.closeConsent!==true)fail('Confirm closing only this unpaid sandbox Checkout Session.',400);
   const order=await finalizer.readOrder(owner,input.orderId);
   try{const result=await bridge.expireUnpaid(order.id);
    if(result.state==='paid-session'){await bind(order.id,result.proof);await payments.recheckBoundPayment(result.proof.paymentId);}
    else await payments.invalidateOrderCheck(order.id);
    return {...await read(owner,order.id),checkoutClosed:result.checkoutClosed===true,refundRequested:false};
   }catch(e){await payments.invalidateOrderCheck(order.id);throw e;}
  },
  // Signed provider delivery can recover a completed Session BEFORE a browser returns.
  // Unknown external payments do not manufacture an order or a binding.
  async receive(raw,signature){
   if(env.VERCEL_ENV!=='preview')return payments.receive(raw,signature);
   const event=verifier.parseEvent(raw,signature);if(!event||event.sandboxDemoId)return payments.receive(raw,signature);
   if(event.checkoutSessionId){
    const row=await orders.read(event.checkoutOrderId);if(!row||row.record.phase!=='finalized')return {received:true,matched:false,realSupplierDispatchAllowed:false};
    let seen=await bridge.inspectSaved(event.checkoutOrderId,{expectedSessionId:event.checkoutSessionId});
    if(seen.state==='creating'&&event.paymentId){await bridge.recoverByPayment(event.checkoutOrderId,event.paymentId);seen=await bridge.inspectSaved(event.checkoutOrderId,{expectedSessionId:event.checkoutSessionId});}
    if(seen.state==='paid-session'){
     if(event.paymentId&&event.paymentId!==seen.proof.paymentId)fail('Signed checkout payment differs from the saved Session.',409);
     await bind(event.checkoutOrderId,seen.proof);
     return event.paymentId?payments.receive(raw,signature):payments.recheckBoundPayment(seen.proof.paymentId);
    }
    if(seen.state!=='expired')fail('Signed checkout event is not yet reconciled with Stripe. Retry the event.',409);
    await payments.invalidateOrderCheck(event.checkoutOrderId);
    return {received:true,matched:true,checkoutState:'expired',captureConfirmed:false,realSupplierDispatchAllowed:false};
   }
   const paymentId=await verifier.eventPaymentId(event),prior=await payments.inspect(paymentId);
   if(!prior.matched){const link=await verifier.checkoutOrder(event);if(!link)return payments.receive(raw,signature);
    const record=await orders.read(link.orderId);if(!record||record.record.phase!=='finalized')return {received:true,matched:false,realSupplierDispatchAllowed:false};
    const seen=await bridge.recoverByPayment(link.orderId,paymentId);if(seen.state!=='paid-session')fail('Saved checkout is not ready for event reconciliation. Retry this signed event.',409);
    if(seen.proof.paymentId!==paymentId)fail('Signed event belongs to a different Checkout payment.',409);await bind(link.orderId,seen.proof);
   }
   return payments.receive(raw,signature);
  }
 };
}
