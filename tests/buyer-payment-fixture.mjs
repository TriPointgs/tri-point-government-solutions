import {randomUUID} from 'node:crypto';import {cartPaymentFixture} from './cart-checkout-fixture.mjs';import {createBuyerPayment} from '../lib/buyer-payment.mjs';import {memoryOrderExtensionStore} from '../lib/order-extension-store.mjs';
export async function buyerPaymentFixture({store=memoryOrderExtensionStore(),patch={},fulfillment=async()=>({state:'supplier-not-confirmed',tracking:[],deliveryConfirmed:false,realSupplierOrderSubmitted:false})}={}){
 const t=await cartPaymentFixture(),order=await t.finalize(),env={...t.env,TP_BUYER_PAYMENT_PREVIEW_ENABLED:'true',TP_BUYER_PAYMENT_PILOT_APPROVED:'true',TP_BUYER_PAYMENT_PILOT_ORDER_ID:order.id,...patch};
 const buyer=createBuyerPayment({env,orders:t.store,checkout:t.service,store,fulfillment,clock:t.now});
 const issue=async()=>buyer.issue({orderId:order.id,expectedRevision:(await buyer.administration(order.id)).revision,consent:true});
 const enter=async()=>buyer.redeem((await issue()).inviteToken);
 const request=()=>({requestId:randomUUID(),termsVersion:t.policy().terms.version,termsDigest:t.policy().terms.contentDigest,termsAccepted:true,testConsent:true});
 return {t,order,env,buyer,store,issue,enter,request};
}
