/** Pure, simulation-only order ledger. No HTTP, payments, mail or distributor calls.
 * Real provider events and production order creation require separate adapters/release.
 */
export class OrderError extends Error{constructor(status,message){super(message);this.name='OrderError';this.status=status;}}
const fail=(message,status=400)=>{throw new OrderError(status,message);};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const str=(x,name,max=160)=>{if(typeof x!=='string'||!x.trim()||x.length>max||/[\x00-\x1f\x7f]/.test(x))fail('Invalid '+name+'.');return x.trim();};
const num=(x,name,min=0,max=1000000000)=>{if(!Number.isSafeInteger(x)||x<min||x>max)fail('Invalid '+name+'.');return x;};
const stable=x=>JSON.stringify(x,(_,v)=>object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const iso=x=>{const t=Date.parse(x);if(!Number.isFinite(t)||new Date(t).toISOString()!==x)fail('Invalid event timestamp.');return x;};
const money=c=>'$'+(c/100).toFixed(2);
export function orderTotals(lines,shippingCents=0,taxCents=0){
 if(!Array.isArray(lines)||!lines.length||lines.length>100)fail('An order needs 1–100 line items.');
 const ids=new Set();let subtotalCents=0,costCents=0;
 for(const l of lines){if(!object(l))fail('Invalid order line.');str(l.id,'line ID',80);str(l.description,'description',240);str(l.sku,'SKU',100);if(ids.has(l.id))fail('Duplicate order line.');ids.add(l.id);num(l.quantity,'quantity',1,9999);num(l.unitPriceCents,'selling price',1);num(l.unitCostCents,'cost',1);if(l.unitPriceCents<l.unitCostCents)fail('Selling price is below cost.');subtotalCents+=l.quantity*l.unitPriceCents;costCents+=l.quantity*l.unitCostCents;num(subtotalCents,'subtotal');num(costCents,'product cost');}
 num(shippingCents,'shipping');num(taxCents,'tax');const totalCents=num(subtotalCents+shippingCents+taxCents,'order total');
 return {subtotalCents,shippingCents,taxCents,totalCents,productCostCents:costCents,productGrossProfitCents:subtotalCents-costCents};
}
function addMessage(order,eventId,kind,audience,subject,text){const id=eventId+':'+kind+':'+audience;if(order.outbox.some(x=>x.id===id))return;order.outbox.push({id,eventId,kind,audience,subject,text,status:'preview_only',attempts:0,dispatchAllowed:false});}
function summary(order){return [order.number,...order.lines.map(l=>`${l.quantity} × ${l.description} (${l.sku}) — ${money(l.unitPriceCents*l.quantity)}`),`Products: ${money(order.totals.subtotalCents)}`,`Shipping: ${money(order.totals.shippingCents)}`,`Tax: ${money(order.totals.taxCents)}`,`Order total: ${money(order.totals.totalCents)}`].join('\n');}
export function createSimulationOrder({id,createdAt=new Date().toISOString(),scenario='standard'}={}){
 str(id,'order ID',80);if(!/^SIM-[A-Za-z0-9-]{8,70}$/.test(id))fail('Simulation ID required.');iso(createdAt);if(!['standard','split-shipment','high-value'].includes(scenario))fail('Unknown simulation scenario.');
 const quantity=scenario==='high-value'?30:2;
 const lines=[{id:'line-1',sku:'DEMO-NOTEBOOK',description:'Demonstration business notebook',quantity,unitCostCents:100000,unitPriceCents:115000},{id:'line-2',sku:'DEMO-DISPLAY',description:'Demonstration office display',quantity:2,unitCostCents:20000,unitPriceCents:23000}];
 const order={schemaVersion:1,mode:'simulation',id,number:'TP-'+id,createdAt,updatedAt:createdAt,revision:1,scenario,currency:'USD',customer:{organization:'Example Organization — SIMULATION',email:'buyer@example.invalid'},lines,totals:orderTotals(lines,2500,0),payment:{status:'unpaid',authorizedCents:0,capturedCents:0,reference:null},review:{status:scenario==='high-value'?'held':'pending',reason:scenario==='high-value'?'Synthetic high-value scenario: manual review required.':''},supplier:{status:'not_submitted',poNumber:'TP-'+id,orderReference:null},shipments:[],outbox:[],events:[]};
 addMessage(order,'created','order_received','customer','[SIMULATION] We received your order',summary(order)+'\n\nPayment is not yet authorized. This is a simulation, not a receipt or supplier acceptance.');
 addMessage(order,'created','new_order','internal','[SIMULATION] New order for review',order.number+'\nReview payment, sourcing, freight, eligibility, and risk before supplier submission.');
 return order;
}
export function fulfillmentStatus(order){
 const total=order.lines.reduce((n,l)=>n+l.quantity,0),shipped=order.shipments.reduce((n,s)=>n+s.items.reduce((m,l)=>m+l.quantity,0),0),delivered=order.shipments.filter(s=>s.status==='delivered').reduce((n,s)=>n+s.items.reduce((m,l)=>m+l.quantity,0),0);
 if(delivered===total)return 'delivered';if(delivered)return 'partially_delivered';if(shipped===total)return 'shipped';if(shipped)return 'partially_shipped';return 'unfulfilled';
}
export function orderStatus(order){if(order.cancelledAt)return 'cancelled';if(order.supplier.status==='uncertain')return 'reconciliation_required';if(order.supplier.status==='rejected'||order.review.status==='held')return 'on_hold';const f=fulfillmentStatus(order);if(f!=='unfulfilled')return f;if(order.supplier.status==='accepted')return 'processing';if(order.supplier.status==='submitting')return 'supplier_pending';if(order.review.status==='approved')return 'ready_for_supplier';if(order.payment.status==='authorized')return 'awaiting_review';return 'awaiting_payment';}
export function remainingItems(order){return order.lines.map(l=>({lineId:l.id,quantity:l.quantity-order.shipments.reduce((n,s)=>n+s.items.filter(i=>i.lineId===l.id).reduce((m,i)=>m+i.quantity,0),0)})).filter(x=>x.quantity>0);}
export function transitionOrder(current,event){
 if(!object(current)||current.mode!=='simulation')fail('Only simulated orders are supported by this release.',403);
 if(!object(event)||Object.keys(event).some(k=>!['id','type','payload','expectedRevision','at'].includes(k)))fail('Invalid event.');
 const id=str(event.id,'event ID',100),type=str(event.type,'event type',80),payload=event.payload??{};
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(id)||!object(payload)||stable(payload).length>8000)fail('Invalid event payload.');
 const fingerprint=stable({type,payload}),prior=current.events.find(e=>e.id===id);
 if(prior){if(prior.fingerprint!==fingerprint)fail('Event ID was already used for a different operation.',409);return {order:structuredClone(current),duplicate:true};}
 if(event.expectedRevision!==current.revision)fail('The order changed. Refresh before retrying.',409);
 if(current.events.length>=400)fail('Simulation event limit reached. Start a new simulation.',409);
 const at=iso(event.at??new Date().toISOString());if(Date.parse(at)<Date.parse(current.updatedAt))fail('Out-of-order event requires reconciliation.',409);
 if(current.cancelledAt)fail('Cancelled orders cannot be changed.',409);
 const o=structuredClone(current);let notice;
 const requireState=(ok,msg)=>{if(!ok)fail(msg,409);};
 switch(type){
 case 'payment.authorized':
  requireState(o.payment.status==='unpaid','Payment is not awaiting authorization.');num(payload.amountCents,'authorized amount',1);requireState(payload.amountCents===o.totals.totalCents,'Authorized amount must match the order total.');o.payment={...o.payment,status:'authorized',authorizedCents:payload.amountCents,reference:str(payload.reference,'payment reference',100)};notice=['payment_authorized','[SIMULATION] Payment authorized','Your simulated payment authorization was recorded. This is not a captured-payment receipt.'];break;
 case 'review.approved':
  requireState(o.payment.status==='authorized','Authorize payment before review approval.');requireState(o.supplier.status==='not_submitted','Supplier submission has already started.');requireState(o.review.status!=='approved','This order is already approved.');str(payload.note,'review note',400);for(const check of ['price','stock','freight','eligibility','risk'])requireState(payload.checks?.[check]===true,'All sourcing and risk checks must pass.');o.review={status:'approved',reason:payload.note};break;
 case 'review.held':
  requireState(o.supplier.status==='not_submitted','Supplier submission has already started.');o.review={status:'held',reason:str(payload.reason,'hold reason',400)};addMessage(o,id,'review_hold','internal','[SIMULATION] Order needs review',o.number+'\n'+o.review.reason);break;
 case 'supplier.submission_started':
  requireState(o.review.status==='approved'&&o.payment.status==='authorized','Approved review and payment authorization are required.');requireState(o.supplier.status==='not_submitted','A supplier attempt already exists. Reconcile it; do not submit again.');o.supplier.status='submitting';o.supplier.submissionKey=o.supplier.poNumber;addMessage(o,id,'supplier_submission','internal','[SIMULATION] Supplier purchase intent',o.number+'\nPO: '+o.supplier.poNumber+'\nDispatch is disabled; no TD SYNNEX order was sent.');break;
 case 'supplier.uncertain':
  requireState(o.supplier.status==='submitting','No supplier attempt is awaiting a response.');o.supplier.status='uncertain';addMessage(o,id,'reconciliation','internal','[SIMULATION] Reconcile before retry',o.number+'\nSupplier outcome is unknown. Query the existing PO and reconcile; never blindly resubmit.');break;
 case 'supplier.accepted':
  requireState(o.supplier.status==='submitting','Supplier acceptance is not expected.');o.supplier.status='accepted';o.supplier.orderReference=str(payload.reference,'supplier reference',100);notice=['supplier_accepted','[SIMULATION] Your order is processing','Supplier acceptance was confirmed in the simulation. Shipping has not yet been confirmed.'];break;
 case 'supplier.reconciled':
  requireState(o.supplier.status==='uncertain','Only uncertain supplier attempts can be reconciled.');requireState(payload.outcome==='accepted','This release supports verified acceptance reconciliation only. Other outcomes require staff review.');o.supplier.status='accepted';o.supplier.orderReference=str(payload.reference,'reconciled supplier reference',100);notice=['supplier_accepted','[SIMULATION] Your order is processing','The existing supplier PO was reconciled as accepted. No second purchase order was created.'];break;
 case 'supplier.rejected':
  requireState(['submitting','uncertain'].includes(o.supplier.status),'No supplier attempt can be rejected.');o.supplier.status='rejected';o.review={status:'held',reason:str(payload.reason,'rejection reason',400)};notice=['supplier_exception','[SIMULATION] Order update — review needed','We need to review fulfillment before proceeding. No shipment or refund has been confirmed.'];break;
 case 'payment.captured':
  requireState(o.payment.status==='authorized'&&o.supplier.status==='accepted','Capture requires prior authorization and supplier acceptance.');num(payload.amountCents,'captured amount',1);requireState(payload.amountCents===o.totals.totalCents,'Captured amount must match the authorized total.');o.payment={...o.payment,status:'captured',capturedCents:payload.amountCents,captureReference:str(payload.reference,'capture reference',100)};notice=['payment_receipt','[SIMULATION] Payment receipt',summary(o)+'\n\nSimulated payment captured. No real card was charged.'];break;
 case 'shipment.created':{
  requireState(o.supplier.status==='accepted'&&o.payment.status==='captured','Supplier acceptance and captured payment are required before shipment.');
  const shipmentId=str(payload.shipmentId,'shipment ID',80);requireState(!o.shipments.some(s=>s.id===shipmentId),'This shipment already exists.');
  requireState(payload.carrier==='SIMULATED','The order lab does not create real carrier tracking.');const tracking=str(payload.trackingNumber,'tracking reference',100);requireState(tracking.startsWith('DEMO-'),'A demonstration tracking reference is required.');requireState(!o.shipments.some(s=>s.trackingNumber===tracking),'Tracking reference already exists.');
  if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>100)fail('Shipment lines required.');
  const seen=new Set(),remaining=remainingItems(o);
  const items=payload.items.map(i=>{if(!object(i))fail('Invalid shipment line.');str(i.lineId,'shipment line',80);num(i.quantity,'shipped quantity',1,9999);requireState(!seen.has(i.lineId),'Duplicate line in shipment.');seen.add(i.lineId);requireState(i.quantity<=(remaining.find(r=>r.lineId===i.lineId)?.quantity??0),'Shipment quantity exceeds the unshipped order quantity.');return {lineId:i.lineId,quantity:i.quantity};});
  o.shipments.push({id:shipmentId,carrier:'SIMULATED',trackingNumber:tracking,items,status:'shipped',shippedAt:at,deliveredAt:null});
  notice=['shipment','[SIMULATION] Shipment update',o.number+'\nTracking: '+tracking+' (demonstration only)\n'+items.map(i=>`${i.quantity} × ${o.lines.find(l=>l.id===i.lineId).description}`).join('\n')+'\nOther items may ship separately.'];break;}
 case 'shipment.delivered':{
  const s=o.shipments.find(s=>s.id===payload.shipmentId);requireState(!!s&&s.status==='shipped','A shipped package is required.');str(payload.reference,'delivery evidence',100);s.status='delivered';s.deliveredAt=at;notice=['delivery','[SIMULATION] Package delivered',o.number+'\nPackage '+s.trackingNumber+' is delivered in this simulation. Other packages may still be in transit.'];break;}
 case 'order.cancelled':
  requireState(o.supplier.status==='not_submitted'&&o.payment.status==='unpaid','Only unpaid, unsubmitted drafts can be cancelled in this release.');o.cancelledAt=at;notice=['cancellation','[SIMULATION] Draft cancelled','This unpaid simulation draft was cancelled. No refund or supplier cancellation was performed.'];break;
 default:fail('Unsupported order event.');
 }
 o.revision++;o.updatedAt=at;o.events.push({id,type,fingerprint,at,revision:o.revision});
 if(notice)addMessage(o,id,notice[0],'customer',notice[1],notice[2]);
 return {order:o,duplicate:false};
}
/** Explicit customer-facing projection. Never return the internal ledger wholesale. */
export function customerOrderView(o){return {number:o.number,mode:o.mode,status:orderStatus(o),createdAt:o.createdAt,currency:o.currency,paymentStatus:o.payment.status,lines:o.lines.map(l=>({id:l.id,sku:l.sku,description:l.description,quantity:l.quantity,unitPriceCents:l.unitPriceCents})),totals:{subtotalCents:o.totals.subtotalCents,shippingCents:o.totals.shippingCents,taxCents:o.totals.taxCents,totalCents:o.totals.totalCents},shipments:o.shipments.map(s=>({id:s.id,carrier:s.carrier,trackingNumber:s.trackingNumber,items:structuredClone(s.items),status:s.status,shippedAt:s.shippedAt,deliveredAt:s.deliveredAt}))};}
export const LAB_ACTIONS=Object.freeze(['authorize','approve','hold','submit','timeout','accept','reconcile','reject','capture','ship_partial','ship_remaining','deliver_next','cancel']);
export function simulationEvent(o,action,id,at=new Date().toISOString()){
 if(!LAB_ACTIONS.includes(action))fail('Unknown simulation action.');
 const ref='DEMO-'+o.id.slice(-8);let type,payload={};
 switch(action){case 'authorize':type='payment.authorized';payload={amountCents:o.totals.totalCents,reference:ref+'-AUTH'};break;case 'approve':type='review.approved';payload={note:'Explicit approval of this synthetic test order.',checks:{price:true,stock:true,freight:true,eligibility:true,risk:true}};break;case 'hold':type='review.held';payload={reason:'Synthetic exception: review requested.'};break;case 'submit':type='supplier.submission_started';break;case 'timeout':type='supplier.uncertain';break;case 'accept':type='supplier.accepted';payload={reference:ref+'-SO'};break;case 'reconcile':type='supplier.reconciled';payload={outcome:'accepted',reference:ref+'-SO'};break;case 'reject':type='supplier.rejected';payload={reason:'Synthetic supplier rejection.'};break;case 'capture':type='payment.captured';payload={amountCents:o.totals.totalCents,reference:ref+'-CAPTURE'};break;case 'ship_partial':case 'ship_remaining':{type='shipment.created';const r=remainingItems(o);payload={shipmentId:'PKG-'+(o.shipments.length+1),carrier:'SIMULATED',trackingNumber:ref+'-PKG-'+(o.shipments.length+1),items:action==='ship_partial'&&r.length?[{lineId:r[0].lineId,quantity:1}]:r};break;}case 'deliver_next':type='shipment.delivered';payload={shipmentId:o.shipments.find(s=>s.status==='shipped')?.id||'NONE',reference:ref+'-DELIVERY'};break;case 'cancel':type='order.cancelled';break;}
 return {id,type,payload,expectedRevision:o.revision,at};
}
export function availableLabActions(o){return LAB_ACTIONS.filter(a=>{try{transitionOrder(o,simulationEvent(o,a,'availability-'+a,o.updatedAt));return true;}catch{return false;}});}
