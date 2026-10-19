import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulationOrder,transitionOrder,simulationEvent,orderStatus,fulfillmentStatus,remainingItems,customerOrderView,availableLabActions,orderTotals,OrderError} from '../lib/commerce-order.mjs';
import {createOrderLabService,createMemoryOrderRepository} from '../lib/commerce-service.mjs';
const at='2026-10-19T00:00:00.000Z';
const fixture=(scenario='standard')=>createSimulationOrder({id:'SIM-test-order-0001',createdAt:at,scenario});
let sequence=0;
const step=(o,a)=>transitionOrder(o,simulationEvent(o,a,'event-'+(++sequence).toString().padStart(6,'0'),at)).order;
const prepared=()=>['authorize','approve','submit','accept','capture'].reduce(step,fixture());

test('order fixtures are explicitly synthetic with immutable initial price snapshot',()=>{
 const o=fixture();assert.equal(o.mode,'simulation');assert.equal(o.customer.email,'buyer@example.invalid');assert.equal(o.totals.totalCents,278500);assert.equal(o.totals.productGrossProfitCents,36000);assert.equal(o.revision,1);assert.equal(o.outbox.length,2);assert.equal(orderStatus(o),'awaiting_payment');assert.equal(o.supplier.poNumber,'TP-'+o.id);
 const next=step(o,'authorize');assert.equal(o.payment.status,'unpaid');assert.equal(next.payment.status,'authorized');assert.deepEqual(next.lines,o.lines);
});
test('complete simulated order follows payment, supplier acceptance, capture, shipping and delivery',()=>{
 let o=fixture();const checks=[['authorize','awaiting_review'],['approve','ready_for_supplier'],['submit','supplier_pending'],['accept','processing'],['capture','processing'],['ship_remaining','shipped'],['deliver_next','delivered']];
 for(const [a,status] of checks){o=step(o,a);assert.equal(orderStatus(o),status);}
 assert.equal(o.payment.capturedCents,o.totals.totalCents);assert.equal(o.shipments.length,1);assert.equal(o.shipments[0].status,'delivered');assert.equal(remainingItems(o).length,0);assert.equal(o.events.length,7);
});
test('split shipments preserve remaining quantities and do not mark the entire order delivered early',()=>{
 let o=step(prepared(),'ship_partial');assert.equal(fulfillmentStatus(o),'partially_shipped');assert.deepEqual(remainingItems(o),[{lineId:'line-1',quantity:1},{lineId:'line-2',quantity:2}]);o=step(o,'deliver_next');assert.equal(orderStatus(o),'partially_delivered');o=step(o,'ship_remaining');assert.equal(orderStatus(o),'partially_delivered');o=step(o,'deliver_next');assert.equal(orderStatus(o),'delivered');assert.equal(o.shipments.length,2);
});
test('uncertain supplier submission blocks automatic resubmission and must reconcile the existing PO',()=>{
 let o=['authorize','approve','submit','timeout'].reduce(step,fixture());const po=o.supplier.poNumber;assert.equal(orderStatus(o),'reconciliation_required');assert.throws(()=>step(o,'submit'),OrderError);assert.throws(()=>step(o,'accept'),OrderError);assert.throws(()=>step(o,'capture'),OrderError);o=step(o,'reconcile');assert.equal(o.supplier.poNumber,po);assert.equal(o.supplier.status,'accepted');assert.equal(o.events.filter(e=>e.type==='supplier.submission_started').length,1);assert.equal(o.outbox.filter(e=>e.kind==='supplier_submission').length,1);
});
test('supplier rejection stops processing and does not invent a payment refund',()=>{
 let o=['authorize','approve','submit','reject'].reduce(step,fixture());assert.equal(orderStatus(o),'on_hold');assert.equal(o.payment.status,'authorized');assert.equal(o.payment.capturedCents,0);assert.throws(()=>step(o,'capture'),OrderError);assert.throws(()=>step(o,'ship_remaining'),OrderError);
});
test('high-value scenario begins held and requires explicit review',()=>{
 let o=fixture('high-value');assert.equal(orderStatus(o),'on_hold');assert.throws(()=>step(o,'submit'),OrderError);o=step(o,'authorize');assert.equal(orderStatus(o),'on_hold');o=step(o,'approve');assert.equal(orderStatus(o),'ready_for_supplier');
});
test('a duplicate event is idempotent even when its original expected revision is old',()=>{
 const o=fixture(),event=simulationEvent(o,'authorize','event-duplicate-0001',at);const first=transitionOrder(o,event),second=transitionOrder(first.order,event);assert.equal(second.duplicate,true);assert.deepEqual(second.order,first.order);assert.equal(second.order.events.length,1);assert.equal(second.order.outbox.length,3);
});
test('reusing an event ID with a different payload is rejected',()=>{
 const o=fixture(),event=simulationEvent(o,'authorize','event-duplicate-0002',at),r=transitionOrder(o,event);assert.throws(()=>transitionOrder(r.order,{...event,payload:{...event.payload,reference:'DEMO-different'}}),e=>e.status===409);
});
test('stale revisions and out-of-order event times are rejected without mutation',()=>{
 const o=fixture(),before=structuredClone(o),event=simulationEvent(o,'authorize','event-valid-0003',at);assert.throws(()=>transitionOrder(o,{...event,expectedRevision:0}),e=>e.status===409);assert.throws(()=>transitionOrder(o,{...event,at:'2026-10-18T23:59:59.000Z'}),e=>e.status===409);assert.deepEqual(o,before);
});
test('payment amounts must match and capture cannot precede supplier acceptance',()=>{
 const o=fixture(),event=simulationEvent(o,'authorize','event-amount-0004',at);assert.throws(()=>transitionOrder(o,{...event,payload:{...event.payload,amountCents:1}}),OrderError);assert.throws(()=>step(o,'capture'),OrderError);const a=step(o,'authorize');assert.throws(()=>step(a,'capture'),OrderError);assert.throws(()=>step(a,'ship_partial'),OrderError);
});
test('review requires every eligibility, stock, freight, price and risk check',()=>{
 const o=step(fixture(),'authorize'),event=simulationEvent(o,'approve','event-review-0005',at);
 for(const field of ['price','stock','freight','eligibility','risk'])assert.throws(()=>transitionOrder(o,{...event,payload:{...event.payload,checks:{...event.payload.checks,[field]:false}}}),OrderError);
});
test('shipment validation rejects excess quantity, duplicate lines, unknown lines, and real carriers',()=>{
 const o=prepared(),e=simulationEvent(o,'ship_remaining','event-shipment-0006',at);
 for(const p of [{items:[{lineId:'line-1',quantity:3}]},{items:[{lineId:'line-1',quantity:1},{lineId:'line-1',quantity:1}]},{items:[{lineId:'unknown',quantity:1}]},{carrier:'UPS'},{trackingNumber:'1Z-REAL'},{items:[]}])assert.throws(()=>transitionOrder(o,{...e,payload:{...e.payload,...p}}),OrderError);
});
test('duplicate package IDs and reused tracking references cannot add quantities twice',()=>{
 const o=step(prepared(),'ship_partial'),e=simulationEvent(o,'ship_remaining','event-shipment-0007',at);assert.throws(()=>transitionOrder(o,{...e,payload:{...e.payload,shipmentId:o.shipments[0].id}}),OrderError);assert.throws(()=>transitionOrder(o,{...e,payload:{...e.payload,trackingNumber:o.shipments[0].trackingNumber}}),OrderError);
});
test('delivery requires an actual shipped package in the simulation',()=>{
 assert.throws(()=>step(prepared(),'deliver_next'),OrderError);let o=step(step(prepared(),'ship_remaining'),'deliver_next');assert.throws(()=>step(o,'deliver_next'),OrderError);
});
test('cancellation is deliberately limited to unpaid and unsubmitted drafts',()=>{
 const o=step(fixture(),'cancel');assert.equal(orderStatus(o),'cancelled');assert.throws(()=>step(o,'authorize'),OrderError);assert.throws(()=>step(step(fixture(),'authorize'),'cancel'),OrderError);
});
test('customer projection and notification previews omit acquisition costs and supplier references',()=>{
 const o=step(prepared(),'ship_remaining'),view=customerOrderView(o),text=JSON.stringify(view);assert.doesNotMatch(text,/unitCostCents|productCostCents|productGrossProfitCents|supplier|outbox|fingerprint/);assert.equal(view.totals.totalCents,o.totals.totalCents);
 for(const m of o.outbox){assert.equal(m.dispatchAllowed,false);assert.equal(m.status,'preview_only');assert.equal(m.attempts,0);if(m.audience==='customer')assert.doesNotMatch(m.text,/unitCostCents|productCostCents|SynnexInternalReference/);}
 assert.equal(o.outbox.filter(m=>m.kind==='payment_receipt').length,1);
});
test('invalid fixture, unsupported events and non-simulation ledgers fail closed',()=>{
 assert.throws(()=>createSimulationOrder({id:'PROD-12345678'}),OrderError);assert.throws(()=>fixture('unknown'),OrderError);
 const o=fixture(),e=simulationEvent(o,'authorize','event-mode-0008',at);assert.throws(()=>transitionOrder({...o,mode:'production'},e),err=>err.status===403);assert.throws(()=>transitionOrder(o,{...e,type:'refund.completed'}),OrderError);assert.throws(()=>transitionOrder(o,{...e,untrustedSwitch:true}),OrderError);
});
test('money and identity validations reject invalid totals and below-cost lines',()=>{
 const lines=fixture().lines;for(const quantity of [0,-1,1.1,10000])assert.throws(()=>orderTotals([{...lines[0],quantity}]),OrderError);assert.throws(()=>orderTotals([{...lines[0],unitPriceCents:1}]),OrderError);assert.throws(()=>orderTotals([lines[0],lines[0]]),OrderError);assert.throws(()=>orderTotals(lines,-1),OrderError);
});
test('available actions reflect state without mutating the ledger',()=>{
 const o=fixture(),copy=structuredClone(o);assert.deepEqual(availableLabActions(o),['authorize','hold','cancel']);assert.deepEqual(o,copy);const p=prepared();assert.ok(availableLabActions(p).includes('ship_remaining'));assert.ok(!availableLabActions(p).includes('submit'));
});
test('service creates idempotently and rejects changed scenarios for the same ID',async()=>{
 const repository=createMemoryOrderRepository(),service=createOrderLabService({repository,clock:()=>at});const input={id:'SIM-service-test-0001',scenario:'standard'};assert.equal((await service.create(input)).created,true);assert.equal((await service.create(input)).created,false);await assert.rejects(service.create({...input,scenario:'high-value'}),e=>e.status===409);
});
test('service repeated action event does not repeat notifications or increment revision',async()=>{
 const service=createOrderLabService({repository:createMemoryOrderRepository(),clock:()=>at});const {order}=await service.create({id:'SIM-service-test-0002'});const a={id:order.id,eventId:'service-event-0001',action:'authorize',expectedRevision:1};const first=await service.action(a),again=await service.action(a);assert.equal(again.duplicate,true);assert.deepEqual(first.order,again.order);await assert.rejects(service.action({...a,action:'hold'}),e=>e.status===409);
});
test('CAS allows only one concurrent state transition at the same revision',async()=>{
 const service=createOrderLabService({repository:createMemoryOrderRepository(),clock:()=>at});const {order}=await service.create({id:'SIM-service-test-0003'});const result=await Promise.allSettled([service.action({id:order.id,eventId:'service-race-0001',action:'authorize',expectedRevision:1}),service.action({id:order.id,eventId:'service-race-0002',action:'hold',expectedRevision:1})]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);assert.equal((await service.read(order.id)).order.events.length,1);
});
test('entire order and pending notifications persist as one revision',async()=>{
 const repository=createMemoryOrderRepository(),service=createOrderLabService({repository,clock:()=>at});const {order}=await service.create({id:'SIM-service-test-0004'});await service.action({id:order.id,eventId:'service-event-0002',action:'authorize',expectedRevision:1});const saved=(await repository.read(order.id)).order;assert.equal(saved.revision,2);assert.equal(saved.events.length,1);assert.equal(saved.outbox.length,3);
});
