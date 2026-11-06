// Server-owned payable snapshots only. A cart/review or browser-supplied paid flag is not an order.
import {createHash} from 'node:crypto';
import {HttpError} from './model.mjs';
import {isVerifiedPayment} from './stripe-payment-verifier.mjs';
export const PAID_FIRST_POLICY='captured-before-supplier-v1';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=message=>{throw new HttpError(400,message);};
const cents=x=>Number.isSafeInteger(x)&&x>=0&&x<=99999999;
const id=(x,pattern)=>typeof x==='string'&&pattern.test(x);
export function validateBinding(binding){
 if(!binding||binding.schemaVersion!==1||binding.policy!==PAID_FIRST_POLICY||binding.provider!=='stripe'||binding.mode!=='test'||binding.currency!=='USD'||!cents(binding.amountCents)||binding.amountCents<1||!id(binding.orderId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)||!Number.isSafeInteger(binding.orderVersion)||binding.orderVersion<1||!id(binding.paymentId,/^pi_[A-Za-z0-9]{4,150}$/)||!id(binding.accountId,/^acct_[A-Za-z0-9]{4,100}$/)||!id(binding.quoteDigest,/^[a-f0-9]{64}$/)||!Number.isFinite(Date.parse(binding.expiresAt))||!Number.isFinite(Date.parse(binding.createdAt))||Date.parse(binding.expiresAt)<=Date.parse(binding.createdAt))fail('Invalid server payment binding.');
 return {schemaVersion:1,policy:binding.policy,provider:'stripe',mode:'test',currency:'USD',amountCents:binding.amountCents,orderId:binding.orderId,orderVersion:binding.orderVersion,paymentId:binding.paymentId,accountId:binding.accountId,quoteDigest:binding.quoteDigest,createdAt:binding.createdAt,expiresAt:binding.expiresAt};
}
export function bindingForFinalOrder(order,{paymentId,accountId,now=Date.now()}={}){
 if(order?.kind!=='payable-order'||order.status!=='awaiting-payment'||order.mode!=='test'||order.currency!=='USD'||order.policy!==PAID_FIRST_POLICY)fail('Only a finalized server-created test order can be bound to payment. Checkout reviews are not payable orders.');
 const lines=order.lines;
 if(!Array.isArray(lines)||!lines.length||lines.length>20||!Array.isArray(order.holds)||order.holds.length)fail('Product review holds must be resolved before payment binding.');
 const seen=new Set();let subtotal=0;
 const items=lines.map(l=>{if(!l||!id(l.sku,/^[1-9]\d{0,11}$/)||seen.has(l.sku)||typeof l.manufacturerPart!=='string'||!l.manufacturerPart||l.manufacturerPart.length>110||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>9999||!cents(l.unitPriceCents)||l.unitPriceCents<1)fail('Invalid finalized order lines.');seen.add(l.sku);subtotal+=l.quantity*l.unitPriceCents;return {sku:l.sku,manufacturerPart:l.manufacturerPart,quantity:l.quantity,unitPriceCents:l.unitPriceCents};});
 if(!cents(subtotal)||order.subtotalCents!==subtotal||!cents(order.shippingCents)||!cents(order.taxCents)||!['calculated','exempt-reviewed'].includes(order.taxStatus)||!id(order.taxEvidence,/^[a-f0-9]{64}$/)||!id(order.addressDigest,/^[a-f0-9]{64}$/)||!id(order.termsVersion,/^[A-Za-z0-9_.-]{3,80}$/))fail('Final shipping, tax/exemption evidence, address and purchase terms are required. Unknown tax is not zero.');
 const total=subtotal+order.shippingCents+order.taxCents;if(!cents(total)||total<1||order.totalCents!==total)fail('Payable total must match products, shipping and tax.');
 const checked=Date.parse(order.quoteCheckedAt),expires=Date.parse(order.quoteExpiresAt);
 if(!Number.isFinite(checked)||!Number.isFinite(expires)||checked>now+30000||expires<=now||expires>checked+900000||now-checked>900000)fail('A current supplier-backed quote is required.');
 const quoteDigest=hash({version:1,orderId:order.id,orderVersion:order.version,items,subtotalCents:subtotal,shippingCents:order.shippingCents,taxCents:order.taxCents,taxStatus:order.taxStatus,taxEvidence:order.taxEvidence,totalCents:total,currency:'USD',addressDigest:order.addressDigest,termsVersion:order.termsVersion,quoteCheckedAt:order.quoteCheckedAt,quoteExpiresAt:order.quoteExpiresAt});
 return validateBinding({schemaVersion:1,policy:PAID_FIRST_POLICY,provider:'stripe',mode:'test',currency:'USD',amountCents:total,orderId:order.id,orderVersion:order.version,paymentId,accountId,quoteDigest,createdAt:new Date(now).toISOString(),expiresAt:order.quoteExpiresAt});
}
export function evaluatePaymentGate(binding,proof,{now=Date.now(),riskHold=false}={}){
 const b=validateBinding(binding),reasons=[];
 if(!isVerifiedPayment(proof))reasons.push('server_verification_required');
 else {
  for(const key of ['provider','mode','accountId','paymentId','orderId','orderVersion','quoteDigest','currency'])if(proof[key]!==b[key])reasons.push('binding_mismatch');
  if(proof.amountCents!==b.amountCents)reasons.push('amount_mismatch');
  if(proof.captured!==true||proof.eligible!==true)reasons.push(...(proof.reasons?.length?proof.reasons:['payment_not_captured']));
  const observed=Date.parse(proof.checkedAt);if(!Number.isFinite(observed)||observed>now+30000||now-observed>60000)reasons.push('payment_evidence_stale');
 }
 if(Date.parse(b.expiresAt)<=now)reasons.push('order_requote_required');
 if(riskHold)reasons.push('adverse_payment_event_requires_review');
 return {policy:PAID_FIRST_POLICY,paymentGatePassed:reasons.length===0,reasons:[...new Set(reasons)],mode:b.mode,realSupplierDispatchAllowed:false,orderId:b.orderId,paymentId:b.paymentId,checkedAt:new Date(now).toISOString(),meaning:'Captured processor payment is not proof of bank payout or protection from future disputes.'};
}
