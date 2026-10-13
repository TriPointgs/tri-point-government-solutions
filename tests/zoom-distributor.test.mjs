import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {HttpError} from '../lib/model.mjs';
import {distributorDraft,distributorDisclosure,validateSentRecord} from '../lib/zoom-distributor.mjs';
import {createZoomService} from '../lib/zoom-service.mjs';
import {ZOOM_CONSENT_VERSION} from '../lib/zoom-model.mjs';
import {sign} from '../lib/security.mjs';
import {createZoomSalesHandler} from '../api/zoom-sales.js';
process.env.TP_SESSION_SECRET='synthetic-distributor-test-secret-longer-than-thirty-two';
process.env.NODE_ENV='test';
const example=()=>({schemaVersion:1,id:randomUUID(),revision:2,isTest:true,
 inquiry:{organization:'PRIVATE ORG CANARY',contact:'PRIVATE CONTACT CANARY',email:'buyer@example.invalid',phone:'555-0000',organizationType:'Local Government',product:'Zoom for Government',requestType:'Existing customer renewal',seats:25,renewalDate:'2027-01-31',quoteDeadline:'2026-11-10T14:00',deadlineTimezone:'America/New_York',solicitationNumber:'PRIVATE-RFQ-204',currentProvider:'PRIVATE PROVIDER CANARY',notes:'PRIVATE PROCUREMENT SECRET',consent:true},
 workflow:{status:'Qualified',seatEstimate:30,assignedTo:'Staff'},finance:{quoteCents:999900,costCents:888800,priceBasis:'PRIVATE MARGIN'},documents:[{url:'https://example.invalid/private-bid.pdf'}],notes:[{text:'INTERNAL STRATEGY'}],history:[],notification:{status:'disabled'}});
function memoryStore(record){
 let current=structuredClone(record),etag=1;
 return {read:async id=>{if(id!==current.id)throw new HttpError(404,'Missing');return {record:structuredClone(current),etag:String(etag)};},save:async (next,match)=>{if(String(etag)!==match)throw new HttpError(409,'Stale');current=structuredClone(next);etag++;return next;},get record(){return structuredClone(current)}};
}
function service(record=example()){const store=memoryStore(record);return {store,service:createZoomService({store,clock:()=>new Date('2026-10-13T14:00:00Z'),configuration:()=>({enabled:false,remindersEnabled:false})})};}
test('default distributor draft shares only non-identifying requirement details',()=>{
 const lead=example(),draft=distributorDraft(lead,{});
 assert.match(draft.body,/Zoom for Government/);assert.match(draft.body,/Local Government/);assert.match(draft.body,/Estimated seat count: 30/);
 for(const secret of ['PRIVATE ORG CANARY','PRIVATE CONTACT CANARY','buyer@example.invalid','555-0000','PRIVATE-RFQ-204','PRIVATE PROVIDER CANARY','PRIVATE PROCUREMENT SECRET','PRIVATE MARGIN','INTERNAL STRATEGY','private-bid.pdf','999900','888800'])assert.ok(!draft.body.includes(secret),'Unexpected disclosure: '+secret);
 assert.match(draft.warning,/Nothing has been emailed/);
});
test('customer organization, RFQ, provider require three independent opt-ins',()=>{
 const lead=example(),d=distributorDraft(lead,{organization:true});
 assert.match(d.body,/PRIVATE ORG CANARY/);
 assert.doesNotMatch(d.body,/PRIVATE-RFQ-204|PRIVATE PROVIDER CANARY/);
 const all=distributorDraft(lead,{organization:true,rfq:true,provider:true});
 assert.match(all.body,/PRIVATE-RFQ-204/);
 assert.match(all.body,/PRIVATE PROVIDER CANARY/);
 assert.doesNotMatch(all.body,/buyer@example.invalid|PRIVATE PROCUREMENT SECRET/);
});
test('empty or false disclosure checkboxes never imply permission',()=>{
 assert.deepEqual(distributorDisclosure({}),{organization:false,rfq:false,provider:false});
 assert.throws(()=>distributorDisclosure({organization:'yes'}));
 assert.throws(()=>distributorDisclosure({includeContacts:true}));
 assert.throws(()=>distributorDisclosure({internalCost:true}));
});
test('draft is stable for same review and invalidated by revisions',()=>{
 const lead=example(),a=distributorDraft(lead,{}),b=distributorDraft(lead,{});
 assert.equal(a.digest,b.digest);
 assert.notEqual(a.digest,distributorDraft({...lead,revision:lead.revision+1},{}).digest);
 assert.notEqual(a.digest,distributorDraft(lead,{rfq:true}).digest);
});
test('sender evidence and actual manual confirmation are required to record',()=>{
 const draft=distributorDraft(example(),{});
 const valid={digest:draft.digest,recipient:'carahsoft@example.invalid',reference:'Manually sent using authorized business mailbox',confirm:true,acknowledgedManualSend:true};
 assert.equal(validateSentRecord(valid,draft).recipient,'carahsoft@example.invalid');
 for(const [k,v] of [['confirm',false],['acknowledgedManualSend',false],['reference','sent'],['recipient','invalid'],['digest','0'.repeat(64)]])assert.throws(()=>validateSentRecord({...valid,[k]:v},draft));
});
test('unsafe supplier email content and unsupported disclosure fields are rejected',()=>{
 const lead=example();for(const value of ['Zoom\nfake','Zoom\rBcc:other@example.invalid'])assert.throws(()=>distributorDraft({...lead,inquiry:{...lead.inquiry,product:value}},{}));
 assert.throws(()=>distributorDraft(lead,{notes:true}),/Invalid disclosure/);
});
test('preview does not mutate any lead or send anything',async()=>{
 const {service:s,store}=service(),before=store.record;
 const draft=await s.previewDistributorRequest(before.id,before.revision,{});
 assert.equal(draft.subject,'Zoom distributor pricing inquiry — Zoom for Government');
 assert.deepEqual(store.record,before);
});
test('manual-send record persists exact reviewed copy and updates early workflow',async()=>{
 const {service:s,store}=service(),lead=store.record;
 const d=await s.previewDistributorRequest(lead.id,lead.revision,{organization:true});
 const result=await s.recordDistributorRequest(lead.id,lead.revision,{digest:d.digest,disclosure:d.disclosure,recipient:'quote@carahsoft.example',reference:'Manual email thread ref 2026-10-13',confirm:true,acknowledgedManualSend:true});
 assert.equal(result.workflow.status,'Awaiting Carahsoft');
 assert.equal(result.distributorRequests.length,1);
 assert.equal(result.distributorRequests[0].body,d.body);
 assert.equal(result.distributorRequests[0].recipient,'quote@carahsoft.example');
 assert.equal(result.history.at(-1).event,'manual-distributor-request-recorded');
 assert.equal(result.revision,lead.revision+1);
 assert.equal(result.inquiry.email,lead.inquiry.email);
 assert.equal(store.record.finance.quoteCents,lead.finance.quoteCents);
});
test('record rejects stale draft and preserves existing record without mutation',async()=>{
 const {service:s,store}=service(),initial=store.record,d=await s.previewDistributorRequest(initial.id,initial.revision,{});
 await s.update(initial.id,initial.revision,{status:'Researching'});
 const updated=store.record;
 await assert.rejects(()=>s.recordDistributorRequest(initial.id,initial.revision,{digest:d.digest,disclosure:d.disclosure,recipient:'quote@example.com',reference:'Manual message evidence',confirm:true,acknowledgedManualSend:true}),e=>e.status===409);
 assert.deepEqual(store.record,updated);
});
test('status Won/Lost prevents new distributor send record',async()=>{
 for(const status of ['Won','Lost']){
  const {service:s,store}=service({...example(),workflow:{status,seatEstimate:30}});
  const l=store.record,d=await s.previewDistributorRequest(l.id,l.revision,{});
  await assert.rejects(()=>s.recordDistributorRequest(l.id,l.revision,{digest:d.digest,disclosure:d.disclosure,recipient:'quote@example.com',reference:'Sent manually via staff account',confirm:true,acknowledgedManualSend:true}),e=>e.status===409);
 }
});
test('old lead without distributorRequests migrates lazily without losing data',async()=>{
 const {service:s,store}=service(),lead=store.record;
 const d=await s.previewDistributorRequest(lead.id,lead.revision,{});
 const result=await s.recordDistributorRequest(lead.id,lead.revision,{digest:d.digest,disclosure:d.disclosure,recipient:'quote@example.com',reference:'Manually sent today',confirm:true,acknowledgedManualSend:true});
 assert.equal(result.distributorRequests.length,1);
});
test('anonymous and contractor cookies cannot preview or record distributor requests',async()=>{
 let calls=0;
 const s={previewDistributorRequest:async()=>{calls++;return {};},recordDistributorRequest:async()=>{calls++;return {};}};
 const h=createZoomSalesHandler({service:s});
 for(const action of ['draft-distributor','record-distributor'])for(const cookie of ['',`__Host-tp_contractor=${sign({type:'contractor',at:Date.now(),profileId:randomUUID()})}`]){
  let content;const res={setHeader:()=>{},end:body=>content=JSON.parse(body)};
  await h({url:'/api/zoom-sales',method:'POST',headers:{origin:'https://tripointgs.com','content-type':'application/json',cookie},body:{action,id:randomUUID(),revision:1,disclosure:{},confirm:true}},res);
  assert.equal(res.statusCode,401);
 }
 assert.equal(calls,0);
});
test('server denies forged-origin distributor activity under an admin session',async()=>{
 let calls=0;const s={recordDistributorRequest:async()=>{calls++;return {};}};const h=createZoomSalesHandler({service:s});
 let content;const res={setHeader:()=>{},end:b=>content=JSON.parse(b)};
 await h({url:'/api/zoom-sales',method:'POST',headers:{origin:'https://unrelated.example','content-type':'application/json',cookie:'__Host-tp_admin='+sign({type:'admin',at:Date.now()})},body:{action:'record-distributor',id:randomUUID()}},res);
 assert.equal(res.statusCode,403);assert.equal(calls,0);
});
