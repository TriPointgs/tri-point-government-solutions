// Converts a fresh, approved server cart snapshot into an immutable TEST payable order.
// No HTTP entry point, card collection, Stripe Session creation, email or TD dispatch.
import {createHash,randomUUID} from 'node:crypto';
import {HttpError} from './model.mjs';
import {cartId} from './shop-cart-store.mjs';
import {createShopService} from './shop-cart-service.mjs';
import {createStripeTaxQuote,isVerifiedTaxQuote,taxCalculationRequest,taxRequestDigest} from './stripe-tax-quote.mjs';
import {PAID_FIRST_POLICY,bindingForFinalOrder} from './payment-release-policy.mjs';
import {stripeTestConfiguration} from './stripe-payment-verifier.mjs';
import {createFinalOrderStore,createFinalizationPolicyReader,finalizationOrderId} from './final-order-store.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const time=x=>typeof x==='string'?Date.parse(x):NaN;
const fail=(message,status=409)=>{throw new HttpError(status,message);};
function approvedPolicy(p,now){
 if(!p||p.schemaVersion!==1||p.mode!=='test'||!Number.isSafeInteger(p.revision)||p.revision<1||!(time(p.expiresAt)>now)||p.terms?.approved!==true||!hex(p.terms.contentDigest)||!/^[A-Za-z0-9_.-]{3,80}$/.test(p.terms.version||'')||!Number.isFinite(time(p.terms.approvedAt))||time(p.terms.approvedAt)>now||p.tax?.reviewed!==true||!hex(p.tax.reviewEvidence)||!Array.isArray(p.tax.products)||p.shipping?.approved!==true||p.shipping.strategy!=='merchant-fixed-from-td-zip-quote'||!hex(p.shipping.reviewEvidence))fail('Purchase terms, tax classification and the merchant shipping policy require approval.');
 const seen=new Set();for(const entry of p.tax.products){if(!/^[1-9]\d{0,11}$/.test(entry.sku||'')||typeof entry.manufacturerPart!=='string'||!entry.manufacturerPart||!/^txcd_\d{8}$/.test(entry.code||'')||seen.has(entry.sku))fail('Approved product tax classifications are incomplete.');seen.add(entry.sku);}return p;
}
function projection(r,now){const o=r.order,expired=time(o.quoteExpiresAt)<=now;return {id:o.id,reference:'TP-TEST-ORDER-'+o.id.slice(0,8).toUpperCase(),mode:'test',status:expired?'requote-required':'awaiting-payment',items:o.lines.map(x=>({sku:x.sku,manufacturerPart:x.manufacturerPart,title:x.description,quantity:x.quantity,unitPriceCents:x.unitPriceCents})),subtotalCents:o.subtotalCents,shippingCents:o.shippingCents,taxCents:o.taxCents,totalCents:o.totalCents,currency:'USD',termsVersion:o.termsVersion,quoteExpiresAt:o.quoteExpiresAt,needsRecheck:expired,canPay:false,paymentCollected:false,supplierOrderSubmitted:false,inventoryReserved:false,emailSent:false};}
export function createOrderFinalization({env=process.env,shop=createShopService({env}),policies=createFinalizationPolicyReader({env}),tax=createStripeTaxQuote({env}),store=createFinalOrderStore({env}),clock=()=>Date.now()}={}){
 const accountId=env.TP_STRIPE_TEST_ACCOUNT_ID;
 const enabled=()=>env.VERCEL_ENV!=='production'&&env.TP_TEST_ORDER_FINALIZATION_ENABLED==='true'&&stripeTestConfiguration(env).configured;
 const guard=()=>{if(!enabled())fail('Test order finalization is not enabled.',503);};
 const owns=(r,owner,review)=>{if(r.owner!==owner||r.reviewId!==review)fail('Finalized order not found.',404);};
 return {
  configuration:()=>({enabled:enabled(),mode:'test',publicCheckoutEnabled:false,supplierDispatchEnabled:false}),
  async finalize(owner,input){guard();cartId(owner);
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['reviewId','termsVersion','termsAccepted'].includes(k))||input.termsAccepted!==true||typeof input.termsVersion!=='string')fail('Accept the current purchase terms; browser totals are not accepted.',400);
   cartId(input.reviewId);const id=finalizationOrderId(accountId,owner,input.reviewId),requestDigest=hash([owner,input.reviewId,input.termsVersion,true]);let saved=await store.read(id);
   if(saved){owns(saved.record,owner,input.reviewId);if(saved.record.requestDigest!==requestDigest)fail('This review already has a different finalization request.');if(saved.record.phase==='finalized')return {...projection(saved.record,clock()),duplicate:true};if(saved.record.phase==='preparing'&&time(saved.record.claimedAt)+60000>clock())fail('This order is being finalized. Retry the same review.');}
   const token=randomUUID(),claim={schemaVersion:1,kind:'checkout-finalization',mode:'test',id,owner,reviewId:input.reviewId,requestDigest,phase:'preparing',revision:(saved?.record.revision||0)+1,claimToken:token,claimedAt:new Date(clock()).toISOString()};
   try{await store.save(id,claim,saved?.etag||null);}catch{const seen=await store.read(id);if(seen?.record.phase==='finalized'&&seen.record.requestDigest===requestDigest){owns(seen.record,owner,input.reviewId);return {...projection(seen.record,clock()),duplicate:true};}if(seen?.record.claimToken!==token)fail('Another request is finalizing this order. Retry the same review.');}
   try{
    const policy=approvedPolicy(await policies.read(),clock()),policyDigest=hash(policy);if(policy.terms.version!==input.termsVersion)fail('Purchase terms changed. Review and accept the current version.');
    if(tax.configuration().enabled!==true)fail('Tax calculation is not configured. An unknown tax amount cannot be zero.',503);
    const source=await shop.finalizationSource(owner,input.reviewId);await shop.assertFinalizationSource(owner,source);
    const d=source.deliveryEvidence;if(d?.source!=='tdsynnex-freight'||d.environment!=='production'||d.currency!=='USD'||d.extraChargesComplete!==true||d.scope!=='destination-zip-estimate'||d.zip!==source.address.postalCode||d.amountCents!==source.shippingEstimateCents||!Number.isSafeInteger(d.amountCents)||d.amountCents<0||!Number.isFinite(time(d.checkedAt))||time(d.checkedAt)>clock()+30000||clock()-time(d.checkedAt)>900000)fail('Current shipping evidence is incomplete.');
    const lines=source.lines.map(line=>{const code=policy.tax.products.find(x=>x.sku===line.sku&&x.manufacturerPart===line.manufacturerPart);if(!code)fail('An exact product tax classification requires review.');return {...line,approvedTaxCode:code.code};});
    const taxInput={lines,shippingCents:source.shippingEstimateCents,address:source.address},plan=taxCalculationRequest({...taxInput,accountId}),proof=await tax.calculate(taxInput);
    if(!isVerifiedTaxQuote(proof)||proof.accountId!==accountId||proof.requestDigest!==taxRequestDigest(accountId,plan.request)||proof.addressDigest!==plan.addressDigest||proof.subtotalCents!==source.subtotalCents||proof.shippingCents!==source.shippingEstimateCents||proof.currency!=='USD'||proof.mode!=='test'||!Number.isFinite(time(proof.checkedAt))||time(proof.checkedAt)>clock()+30000||clock()-time(proof.checkedAt)>60000||!(time(proof.expiresAt)>clock()))fail('Tax evidence does not match this exact order.',503);
    await shop.assertFinalizationSource(owner,source);if(hash(approvedPolicy(await policies.read(),clock()))!==policyDigest)fail('Merchant approvals changed while this order was being checked.');
    const expires=Math.min(time(source.quoteExpiresAt),time(proof.expiresAt),time(policy.expiresAt));if(expires-clock()<300000)fail('The verified quote is too close to expiry. Prepare a fresh review.');
    const order={kind:'payable-order',status:'awaiting-payment',mode:'test',policy:PAID_FIRST_POLICY,currency:'USD',id,version:1,lines:source.lines.map(x=>({...x})),holds:[],subtotalCents:source.subtotalCents,shippingCents:source.shippingEstimateCents,taxCents:proof.taxCents,taxStatus:'calculated',taxEvidence:proof.taxEvidence,totalCents:proof.totalCents,addressDigest:proof.addressDigest,termsVersion:policy.terms.version,quoteCheckedAt:source.quoteCheckedAt,quoteExpiresAt:new Date(expires).toISOString()};
    bindingForFinalOrder(order,{accountId,paymentId:'pi_PENDINGORDERVALIDATION',now:clock()});
    const current=await store.read(id);if(current?.record.claimToken!==token||current.record.phase!=='preparing')fail('A newer finalization superseded this request.');
    const record={...current.record,phase:'finalized',revision:current.record.revision+1,claimToken:null,completedAt:new Date(clock()).toISOString(),order,privateContact:structuredClone(source.contact),privateAddress:structuredClone(source.address),acceptance:{version:policy.terms.version,contentDigest:policy.terms.contentDigest,acceptedAt:claim.claimedAt},source:{reviewFingerprint:source.reviewFingerprint,cartRevision:source.cartRevision,productRevision:source.productRevision,settingsRevision:source.settingsRevision},policyDigest,taxCalculationId:proof.taxCalculationId,shippingBasis:'merchant-fixed-from-td-zip-quote',supplierFreightGuaranteed:false};
    try{await store.save(id,record,current.etag);}catch{const recovered=await store.read(id);if(recovered?.record.phase!=='finalized'||recovered.record.requestDigest!==requestDigest||hash(recovered.record.order)!==hash(order))fail('Order save could not be confirmed. Retry the same review.',503);return {...projection(recovered.record,clock()),duplicate:true};}
    return {...projection(record,clock()),duplicate:false};
   }catch(e){try{const current=await store.read(id);if(current?.record.phase==='preparing'&&current.record.claimToken===token)await store.save(id,{...current.record,phase:'blocked',revision:current.record.revision+1,claimToken:null,lastFailureAt:new Date(clock()).toISOString()},current.etag);}catch{/* Preserve an uncertain claim rather than fabricate completion. */}if(e instanceof HttpError)throw e;fail('Order finalization could not be completed. No payment or supplier order was created.',503);}
  },
  async read(owner,reviewId){guard();cartId(owner);cartId(reviewId);const r=await store.read(finalizationOrderId(accountId,owner,reviewId));if(!r)fail('Finalized order not found.',404);owns(r.record,owner,reviewId);if(r.record.phase!=='finalized')return {id:r.record.id,status:r.record.phase,mode:'test',canPay:false,paymentCollected:false,supplierOrderSubmitted:false};return projection(r.record,clock());},
  // Dependency for the server-only Checkout bridge; never expose this method to a browser.
  paymentOrderStore(){return {get:async id=>{guard();cartId(id);const row=await store.read(id);return row?.record.phase==='finalized'?structuredClone(row.record.order):null;}};}
 };
}
