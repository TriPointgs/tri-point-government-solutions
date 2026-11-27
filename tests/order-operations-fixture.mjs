import {cartPaymentFixture} from './cart-checkout-fixture.mjs';
import {memoryOrderExtensionStore} from '../lib/order-extension-store.mjs';
import {createBuyerOrderAccess} from '../lib/buyer-order-access.mjs';
import {createSupplierHandoff} from '../lib/supplier-handoff.mjs';
import {normalizeOrderStatus} from '../lib/td-order-status.mjs';
export async function operationsFixture({buyerStore=memoryOrderExtensionStore(),supplierStore=memoryOrderExtensionStore()}={}){
 const t=await cartPaymentFixture(),order=await t.finalize();t.env.TP_BUYER_ORDER_PREVIEW_ENABLED='true';t.env.TP_SUPPLIER_HANDOFF_PREVIEW_ENABLED='true';
 let failure=false,patch=x=>x,environment='uat',enabled=true;const calls={status:0,sourcing:0};
 const td={orderStatusConfiguration:()=>({enabled,environment}),async orderStatus(selector){calls.status++;if(failure){const e=Error('PRIVATE PROVIDER ERROR');e.code='order_not_found';throw e;}const rows=[{orderNumber:'10001',salesOrderNumber:'10001',purchaseOrderNumber:selector.reference,orderStatus:'Open',unitCost:'PRIVATE COST',shipTo:'PRIVATE ADDRESS',lines:order.items.map((x,i)=>({lineNumber:String(i+1),partNumber:x.sku,manufacturerPartNumber:x.manufacturerPart,totalQuantity:String(x.quantity),subLines:[{displayLineNumber:(i+1)+'.1',partNumber:x.sku,manufacturerPartNumber:x.manufacturerPart,quantity:String(x.quantity),lineStatus:'Shipped',tracking:[{trackingNumber:'1Z1234567890',shippingMethod:'UPS Ground',quantity:String(x.quantity),trackingLink:'https://evil.test/'}]}]}))}];return normalizeOrderStatus(patch(rows),selector,{environment,checkedAt:new Date(t.now()).toISOString()});}};
 const supplier=createSupplierHandoff({env:t.env,orders:t.store,checkout:t.service,store:supplierStore,td,clock:t.now,sourcing:async r=>{calls.sourcing++;return t.finalizer.assertCheckoutReady(r.owner,r.id);}});
 const buyer=createBuyerOrderAccess({env:t.env,orders:t.store,checkout:t.service,store:buyerStore,fulfillment:id=>supplier.buyerView(id),clock:t.now});
 return {t,order,buyer,supplier,buyerStore,supplierStore,calls,td,setFailure:v=>{failure=v;},setPatch:v=>{patch=v;},setEnvironment:v=>{environment=v;},setEnabled:v=>{enabled=v;},async pay(){await t.service.open(t.owner,{orderId:order.id,testConsent:true});t.paid();return t.service.reconcile(t.owner,{orderId:order.id});}};
}
