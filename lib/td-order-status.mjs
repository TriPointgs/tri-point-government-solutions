// Implements only the supplied US GetOrderStatus response contract. No purchase operation.
import {HttpError} from './model.mjs';
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export class TdOrderReadError extends HttpError { constructor(code, message, status=502) { super(status,message); this.code=code; this.name='TdOrderReadError'; } }
const fail=(code,message,status)=>{throw new TdOrderReadError(code,message,status);};
const text=(x,max=160)=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):Number.isSafeInteger(x)?String(x):'';
const quantity=x=>{const s=typeof x==='string'?x.trim():Number.isSafeInteger(x)?String(x):'';return /^(0|[1-9]\d{0,7})$/.test(s)?Number(s):null;};
function dateText(x) { const s=text(x,40);return /^(?:\d{2}\/\d{2}\/\d{4}(?: \d{2}:\d{2}:\d{2})?|\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?)$/.test(s)?s:null; }
export function orderSelector(input) {
 if(!plain(input)||Object.keys(input).some(k=>!['referenceType','reference'].includes(k)))fail('invalid_order_selector','Use an existing purchase-order or sales-order reference.',400);
 const referenceType=input.referenceType,reference=typeof input.reference==='string'?input.reference.trim():'';
 if(!['PO','SO'].includes(referenceType)||reference.length>80||!(/^[A-Za-z0-9][A-Za-z0-9 ._/#-]*$/.test(reference)))fail('invalid_order_selector','Enter a valid existing TD order reference.',400);
 if(referenceType==='SO'&&!/^[1-9]\d{0,14}$/.test(reference))fail('invalid_order_selector','A sales-order reference must be numeric.',400);
 return {referenceType,reference};
}
export function orderStatusPath(input) { const s=orderSelector(input);return '/api/v1/webservice/json/GetOrderStatus/orderNo/'+encodeURIComponent(s.reference)+'?inputType='+(s.referenceType==='PO'?'PO-v2':'SO'); }
function array(value,max,label){if(value===null||value===undefined)return [];if(!Array.isArray(value)||value.length>max)fail('order_response_shape','The supplier '+label+' exceeded its supported format.');return value;}
function identifier(x,max=100){const s=text(x,max+1);return s&&s.length<=max&&!/[<>]/.test(s)?s:'';}
export function trackingURL(method,number){
 if(typeof number!=='string'||!/^[A-Za-z0-9][A-Za-z0-9-]{4,99}$/.test(number))return null;
 const m=String(method||'').toUpperCase(),encoded=encodeURIComponent(number);
 if(/\bUPS\b/.test(m))return 'https://www.ups.com/track?tracknum='+encoded;
 if(/\bFEDEX\b|FEDERAL EXPRESS/.test(m))return 'https://www.fedex.com/fedextrack/?trknbr='+encoded;
 if(/\bUSPS\b|UNITED STATES POSTAL/.test(m))return 'https://tools.usps.com/go/TrackConfirmAction?tLabels='+encoded;
 return null;
}
export function normalizeOrderStatus(raw,input,{environment,checkedAt}={}) {
 const selector=orderSelector(input);
 if(!['uat','production'].includes(environment)||!Number.isFinite(Date.parse(checkedAt)))fail('order_context','Invalid supplier observation context.');
 if(!Array.isArray(raw)||raw.length>100)fail('order_response_shape','The supplier did not return a valid order-status array.');
 if(!raw.length)fail('order_not_found','No matching supplier order was returned.',404);
 // An HTTP 200 with an errorMessage is an error, including errors mixed with valid rows.
 for(const row of raw)if(!plain(row)||row.errorMessage||row.errorDetail)fail('order_business_error','The supplier could not verify the order. Check the reference and account access.');
 const orders=[],orderIds=new Set(),trackingKeys=new Set();let lineCount=0,subCount=0,trackingCount=0,backordered=false;
 for(const row of raw){
  const reportedOrder=identifier(row.orderNumber),reportedSO=identifier(row.salesOrderNumber),po=identifier(row.purchaseOrderNumber,80),so=reportedSO||reportedOrder;
  if(!so)fail('order_identity_missing','The response is missing a supplier order identity.');
  if(reportedOrder&&reportedSO&&reportedOrder!==reportedSO)fail('order_identity_conflict','The supplier returned conflicting order identities.');
  if(selector.referenceType==='PO'&&po!==selector.reference)fail('order_identity_mismatch','A returned order does not match the requested purchase order.');
  if(selector.referenceType==='SO'&&so!==selector.reference)fail('order_identity_mismatch','A returned sales order does not match the requested reference.');
  if(orderIds.has(so))fail('order_identity_duplicate','The supplier returned ambiguous duplicate sales orders.');orderIds.add(so);
  const lines=[],lineIds=new Set();
  for(const line of array(row.lines,500,'order lines')){
   if(++lineCount>1000||!plain(line))fail('order_response_shape','The supplier order line collection is invalid.');
   const lineNumber=identifier(line.lineNumber,40),part=identifier(line.partNumber),mpn=identifier(line.manufacturerPartNumber,110);
   if(!lineNumber||lineIds.has(lineNumber))fail('order_line_identity','The supplier returned missing or duplicate line identities.');lineIds.add(lineNumber);
   const subLines=[],seenSub=new Set();
   for(const sub of array(line.subLines,100,'shipment lines')){
    if(++subCount>2000||!plain(sub))fail('order_response_shape','The supplier shipment-line collection is invalid.');
    const subPart=identifier(sub.partNumber),subMpn=identifier(sub.manufacturerPartNumber,110),subId=identifier(sub.displayLineNumber,60);
    const identityConflict=!!((mpn&&subMpn&&mpn.toUpperCase()!==subMpn.toUpperCase())||(part&&subPart&&part!==subPart));
    const issues=[];if(identityConflict)issues.push('subline-product-needs-review');
    if(sub.isMultiLineKit===true||line.bundleIndicator===true)issues.push('kit-or-bundle-quantities-not-aggregated');
    const tracking=[],seenTracks=new Set();
    for(const entry of array(sub.tracking,100,'tracking records')){
     if(++trackingCount>3000||!plain(entry))fail('order_response_shape','The supplier tracking collection is invalid.');
     const number=identifier(entry.trackingNumber,100),method=text(entry.shippingMethod,80),container=identifier(entry.containerNumber,100);
     if(!number||identityConflict)continue;
     const key=JSON.stringify([method,number,container]);if(seenTracks.has(key))continue;seenTracks.add(key);trackingKeys.add(JSON.stringify([so,method,number]));
     tracking.push({number,method:method||null,container:container||null,reportedQuantity:quantity(entry.quantity),url:trackingURL(method,number)});
    }
    tracking.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const normalized={subLine:subId||null,partNumber:subPart||part||null,manufacturerPart:subMpn||mpn||null,reportedQuantity:quantity(sub.quantity),supplierStatus:text(sub.lineStatus,100)||null,backordered:sub.isBackordered===true,estimatedShip:dateText(sub.estimatedToShip),estimatedDelivery:dateText(sub.estimatedDeliveryDate),supplierShipDate:dateText(sub.shipDate),tracking,issues};
    const key=JSON.stringify(normalized);if(seenSub.has(key))continue;seenSub.add(key);subLines.push(normalized);if(normalized.backordered)backordered=true;
   }
   subLines.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   lines.push({lineNumber,partNumber:part||null,manufacturerPart:mpn||null,description:text(line.partDescription,300),supplierStatus:text(line.lineStatus,100)||null,reportedOrderedQuantity:quantity(line.totalQuantity),quantityAggregation:'not-calculated',subLines});
  }
  lines.sort((a,b)=>a.lineNumber.localeCompare(b.lineNumber,undefined,{numeric:true}));
  orders.push({salesOrder:so,purchaseOrder:po||null,supplierStatus:text(row.orderStatus,100)||'Not reported',lines});
 }
 orders.sort((a,b)=>a.salesOrder.localeCompare(b.salesOrder));
 return {schemaVersion:1,source:'tdsynnex-order-status',environment,checkedAt,selector,identityMatched:true,orders,summary:{salesOrders:orders.length,lines:lineCount,trackingReferences:trackingKeys.size,backorderReported:backordered},deliveryConfirmed:false,paymentVerified:false,orderSubmittedByThisRequest:false,dateContext:'Supplier-reported text; timezone and delivery are not independently verified.'};
}
