// Strictly loopback synthetic fixtures; never loaded by a hosted route.
import {createOrderTrackingHandler} from '../lib/order-tracking-handler.mjs';
import {createOrderTracking} from '../lib/order-tracking-service.mjs';
import {memoryTrackingStore} from '../lib/order-tracking-store.mjs';
import {normalizeOrderStatus} from '../lib/td-order-status.mjs';
if(process.env.VERCEL||process.env.NODE_ENV!=='test')throw Error('Supplier tracking fixtures are only for isolated local tests.');
const counts=new Map();
const td={orderStatusConfiguration:()=>({enabled:true,environment:'uat',readOnly:true,approvalPresent:true}),async orderStatus(selector){const call=(counts.get(selector.reference)||0)+1;counts.set(selector.reference,call);if(selector.reference==='SYNTHETIC-FAIL'&&call>1)throw Error('Synthetic read unavailable');
 const changed=call>1,so=selector.referenceType==='SO'?selector.reference:'10001',po=selector.referenceType==='PO'?selector.reference:'SYNTHETIC-PO-1';
 const row={orderNumber:so,salesOrderNumber:so,purchaseOrderNumber:po,orderStatus:changed?'Shipped':'Open',lines:[{lineNumber:'1',partNumber:'12345',manufacturerPartNumber:'SYNTHETIC-PART-1',partDescription:'Synthetic notebook',totalQuantity:'2',subLines:[{displayLineNumber:'1.1',partNumber:'12345',manufacturerPartNumber:'SYNTHETIC-PART-1',quantity:'1',lineStatus:'Shipped',shipDate:'10/21/2026 10:00:00',tracking:[{trackingNumber:'1ZTEST123456',quantity:'1',shippingMethod:'UPS Ground',trackingLink:'https://evil.invalid/DO-NOT-LINK'}]},{displayLineNumber:'1.2',partNumber:'12345',manufacturerPartNumber:'SYNTHETIC-PART-1',quantity:'1',lineStatus:changed?'Shipped':'Backordered',isBackordered:!changed,tracking:changed?[{trackingNumber:'1ZTEST654321',shippingMethod:'UPS Ground',quantity:'1'}]:[]}]}]};
 return normalizeOrderStatus([row],selector,{environment:'uat',checkedAt:new Date().toISOString()});}};
export const previewOrderTracking=createOrderTrackingHandler({env:{VERCEL_ENV:'preview'},service:createOrderTracking({env:{VERCEL_ENV:'preview'},td,store:memoryTrackingStore()}),rate:async()=>{}});
