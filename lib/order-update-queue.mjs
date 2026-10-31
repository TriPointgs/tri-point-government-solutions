import {refundStatusDescription} from './order-exception-view.mjs';
// Durable customer-message DRAFTS only. No email provider, recipients or dispatch path.
import {randomUUID} from 'node:crypto';
import {createFinalOrderStore} from './final-order-store.mjs';
import {createCartCheckoutService} from './cart-checkout-service.mjs';
import {createSupplierDispatch} from './supplier-dispatch.mjs';
import {fault,hash,fields,orderId,finalized,orderSeal,previewMerchant,createOrderExtensionStore} from './order-extension-store.mjs';
export function createOrderUpdateQueue({env=process.env,orders=createFinalOrderStore({env}),checkout=createCartCheckoutService({env}),dispatch=createSupplierDispatch({env,orders,checkout}),store=createOrderExtensionStore({area:'order-updates',env}),clock=()=>Date.now()}={}){
 const project=(r,id)=>({mode:'test',orderId:id,revision:r?.revision||0,records:r?.records||[],snapshotAt:r?.snapshotAt||null,emailSent:false,dispatchEnabled:false,recipientVerified:false});
 async function context(id){previewMerchant(env);const order=await finalized(orders,id),row=await store.read(id);if(row&&row.record.seal!==orderSeal(order))fault('Order update history differs from the finalized order.',409);return {order,row};}
 return {
  async read(id){const {row}=await context(id);return project(row?.record,id);},
  async sync(input){fields(input,['orderId','expectedRevision','requestId']);orderId(input.requestId);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER-1)fault('Invalid update queue revision.');const {order,row}=await context(input.orderId),digest=hash([input.orderId,input.expectedRevision]);
   if(row?.record.requestId===input.requestId){if(row.record.requestDigest!==digest)fault('Update request ID was reused.',409);return project(row.record,input.orderId);}
   if((row?.record.revision||0)!==input.expectedRevision)fault('Order update queue changed. Reload before saving.',409);
   const payment=await checkout.administratorRead(order.id),supplier=await dispatch.read(order.id);const facts=[{key:'received',kind:'order-received',subject:'Test order saved',text:'Your test order was saved. This is not a receipt, supplier acceptance or shipment confirmation.'}];
   if(payment.captureConfirmed&&!payment.exception?.refund.attempted)facts.push({key:'capture-observed',sourceCheckedAt:payment.paymentVerifiedAt,kind:'payment-observed',subject:'Test payment capture observed',text:'A server check observed the test payment capture. This is not a bank payout or supplier fulfillment confirmation.'});
   if(supplier.supplierAccepted)facts.push({key:'supplier-acknowledged',sourceCheckedAt:supplier.checkedAt,kind:'supplier-acknowledged',subject:'Test supplier acknowledgment recorded',text:'TD UAT reported a matching test order acknowledgment. This is not a real purchase, a shipment or confirmation of final supplier charges.'});
   if(['uncertain','rejected','blocked'].includes(supplier.state))facts.push({key:'review-'+supplier.state,kind:'review-required',subject:'Test order needs review',text:'The test order needs staff review. Do not make another payment or submit a replacement purchase order. Supplier review is not proof of a refund; consult the separately saved refund status.'});
   const exception=payment.exception;
   if(exception?.releaseStopped!==supplier.releaseStopped)fault('Order hold changed while preparing its messages.',409);
   if(exception?.releaseStopped)facts.push({key:'release-stopped',sourceCheckedAt:supplier.stoppedAt,kind:'release-stopped',subject:'Test supplier release stopped',text:'This test order is permanently stopped before supplier release. This is not supplier cancellation, checkout expiration or proof of a refund.'});
   if(exception?.refund.attempted)facts.push({key:'refund-'+exception.refund.state,kind:'refund-status',subject:'Saved test refund status: '+exception.refund.state.replaceAll('_',' '),text:refundStatusDescription(exception.refund.state),sourceCheckedAt:exception.refund.observedAt});
   const existing=row?.record.records||[],records=existing.map(x=>({...x,current:false}));for(const fact of facts){const id=hash([order.id,orderSeal(order),fact.key]),found=records.find(x=>x.id===id);if(found){found.current=true;found.subject='[TEST DRAFT — NOT SENT] '+fact.subject;found.text=fact.text;found.sourceCheckedAt=fact.sourceCheckedAt??new Date(clock()).toISOString();continue;}records.push({id,kind:fact.kind,subject:'[TEST DRAFT — NOT SENT] '+fact.subject,text:fact.text,createdAt:new Date(clock()).toISOString(),sourceCheckedAt:fact.sourceCheckedAt??new Date(clock()).toISOString(),status:'draft-not-sent',current:true});}
   if(records.length>20)fault('Order update history requires review.',409);const operation=randomUUID(),record={schemaVersion:1,kind:'order-updates',mode:'test',orderId:order.id,seal:orderSeal(order),revision:input.expectedRevision+1,requestId:input.requestId,requestDigest:digest,operation,snapshotAt:new Date(clock()).toISOString(),records};
   // Sources can change during reads. Recheck before committing a prepared message snapshot.
   const latest=await finalized(orders,order.id),p=await checkout.administratorRead(order.id),d=await dispatch.read(order.id);if(orderSeal(latest)!==record.seal||p.captureConfirmed!==payment.captureConfirmed||d.revision!==supplier.revision||hash(p.exception)!==hash(payment.exception))fault('Order status changed while preparing its messages. Reload and retry.',409);
   try{await store.save(order.id,record,row?.etag||null);}catch{const seen=await store.read(order.id);if(seen?.record.operation!==operation)fault('Order update save is uncertain or changed. Retry the same request.',409);}
   const seen=await store.read(order.id);if(seen?.record.operation!==operation)fault('Order updates could not be read back.',503);return project(seen.record,order.id);
  }
 };
}
