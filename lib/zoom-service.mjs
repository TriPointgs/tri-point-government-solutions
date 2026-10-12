import {randomUUID} from 'node:crypto';
import {HttpError} from './model.mjs';
import {digest} from './security.mjs';
import {validId} from './opportunity-storage.mjs';
import {validateZoomInquiry,validateAdminPatch,text,financials,dueFlags,dateInZone,matchesLead,leadSummary,leadsCsv} from './zoom-model.mjs';
import {zoomStore} from './zoom-store.mjs';
import {zoomMailConfiguration,sendZoomAlert,sendZoomReminders} from './zoom-mail.mjs';
export function createZoomService({store=zoomStore,clock=()=>new Date(),mailer=sendZoomAlert,reminderMailer=sendZoomReminders,configuration=zoomMailConfiguration}={}){
 const now=()=>clock().toISOString();
 async function all(){let cursor=null,records=[],pages=0;do{const page=await store.page(cursor);records.push(...page.records);if(records.length>2000||++pages>85)throw new HttpError(503,'The Zoom lead collection exceeds this release’s scan limit. No partial export is returned; move to an indexed database before further growth.');if(page.hasMore&&!page.cursor)throw new HttpError(503,'A private lead page could not be completed.');cursor=page.hasMore?page.cursor:null;}while(cursor);return records;}
 function ensureRevision(record,revision){if(!Number.isSafeInteger(revision)||revision!==record.revision)throw new HttpError(409,'This lead changed. Refresh and review the latest version before saving.');}
 function history(record,event,fields=[]){return [...record.history,{id:randomUUID(),at:now(),actor:'authenticated-administrator',event,fields}].slice(-200);}
 async function notify(id){
  const current=await store.read(validId(id)),lead=current.record;
  if(['accepted','sending','uncertain'].includes(lead.notification.status))return lead.notification;
  const config=configuration();
  if(!config.enabled||lead.isTest){
   if(lead.notification.status!=='disabled')await store.save({...lead,revision:lead.revision+1,notification:{status:'disabled',reason:lead.isTest?'review-test':'sender-not-enabled'}},current.etag);
   return {status:'disabled'};
  }
  const claimed={...lead,revision:lead.revision+1,notification:{status:'sending',attemptedAt:now()}};
  await store.save(claimed,current.etag);
  let notification;try{const result=await mailer(claimed);notification={...claimed.notification,status:'accepted',messageId:result.messageId,acceptedAt:now()};}
  catch(e){notification={...claimed.notification,status:e.deliveryState==='failed'?'failed':'uncertain'};}
  // Business edits may race with email acceptance; refresh before updating only the outbox field.
  for(let tries=0;tries<3;tries++){
   const latest=await store.read(id);
   try{await store.save({...latest.record,revision:latest.record.revision+1,notification},latest.etag);return notification;}
   catch(e){if(e.status!==409||tries===2)throw e;}
  }
 }
 return {
  async submit(input,id,{isTest=false}={}){
   validId(id);const inquiry=validateZoomInquiry(input),submissionHash=digest(JSON.stringify(inquiry));
   const timestamp=now();const lead={schemaVersion:1,id,revision:1,createdAt:timestamp,updatedAt:timestamp,isTest:!!isTest,inquiry,submissionHash,
    workflow:{status:'New',assignedTo:'',followUpDate:'',renewalReminderDate:'',productEstimate:'',seatEstimate:inquiry.seats},
    finance:{quoteCents:null,costCents:null,currency:'USD',priceBasis:''},documents:[],notes:[],history:[],notification:{status:'pending'}};
   const result=await store.create(lead);
   if(result.record.submissionHash!==submissionHash||result.record.isTest!==!!isTest)throw new HttpError(409,'This form reference was already submitted with different information. Reload before submitting a new request.');
   try{await notify(id);}catch(e){console.error('Zoom saved inquiry alert needs review',e?.name||'Error');}
   return {id,isTest:result.record.isTest,created:result.created};
  },
  async get(id){const {record}=await store.read(validId(id));return {...record,calculated:financials(record),due:dueFlags(record,dateInZone(clock()))};},
  async list(filters={},offset=0){
   const today=dateInZone(clock()),records=(await all()).filter(x=>matchesLead(x,filters,today)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
   if(!Number.isSafeInteger(offset)||offset<0||offset>2000)throw new HttpError(400,'Invalid lead page.');
   return {leads:records.slice(offset,offset+25).map(x=>leadSummary(x,today)),total:records.length,nextOffset:offset+25<records.length?offset+25:null,today,due:{followUp:records.filter(x=>dueFlags(x,today).followUp).length,renewal:records.filter(x=>dueFlags(x,today).renewal).length}};
  },
  async export(filters={}){return leadsCsv((await all()).filter(x=>matchesLead(x,filters,dateInZone(clock()))));},
  async update(id,revision,input){
   const delta=validateAdminPatch(input),{record,etag}=await store.read(validId(id));ensureRevision(record,revision);
   const next=structuredClone(record);for(const [k,v]of Object.entries(delta)){if(['quoteCents','costCents','priceBasis'].includes(k))next.finance[k]=v;else if(k==='documents')next.documents=v;else next.workflow[k]=v;}
   next.updatedAt=now();next.revision++;next.history=history(record,'lead-updated',Object.keys(delta));await store.save(next,etag);return this.get(id);
  },
  async addNote(id,revision,value){const note=text(value,'internal note',4000,true),{record,etag}=await store.read(validId(id));ensureRevision(record,revision);if(record.notes.length>=100)throw new HttpError(400,'This lead has reached its note limit. Preserve older notes before adding more.');const next={...record,revision:record.revision+1,updatedAt:now(),notes:[...record.notes,{id:randomUUID(),text:note,at:now(),actor:'authenticated-administrator'}],history:history(record,'note-added')};await store.save(next,etag);return this.get(id);},
  async retryAlert(id,revision){const {record}=await store.read(validId(id));ensureRevision(record,revision);if(['sending','uncertain'].includes(record.notification.status))throw new HttpError(409,'Delivery is uncertain. Check the provider record before reconciling; do not blindly resend.');await notify(id);return this.get(id);},
  async reconcileAlert(id,revision,accepted,evidence){
   const note=text(evidence,'delivery evidence',1000,true),{record,etag}=await store.read(validId(id));ensureRevision(record,revision);
   if(!['sending','uncertain'].includes(record.notification.status)||typeof accepted!=='boolean')throw new HttpError(400,'This alert does not need reconciliation.');
   if(Date.parse(record.notification.attemptedAt)+60000>clock().getTime())throw new HttpError(409,'Allow the in-flight request to finish before reconciling.');
   const notification={...record.notification,status:accepted?'accepted':'failed',reconciledAt:now(),evidence:note};
   await store.save({...record,revision:record.revision+1,notification,history:history(record,'alert-reconciled')},etag);return this.get(id);
  },
  async reminderDigest(){
   if(!configuration().remindersEnabled)return {status:'disabled'};
   const day=dateInZone(clock()),existing=await store.readRun(day);if(existing)return {status:existing.record.status,alreadyAttempted:true};
   const leads=(await all()).filter(x=>!x.isTest),followUp=leads.filter(x=>dueFlags(x,day).followUp).length,renewal=leads.filter(x=>dueFlags(x,day).renewal).length;
   if(!followUp&&!renewal)return {status:'nothing-due'};
   const record={day,status:'sending',attemptedAt:now(),followUp,renewal};await store.saveRun(record);
   let result;try{const receipt=await reminderMailer(day,followUp,renewal);result={...record,status:'accepted',messageId:receipt.messageId};}catch{result={...record,status:'uncertain'};}
   const latest=await store.readRun(day);await store.saveRun(result,latest.etag);return {status:result.status,followUp,renewal};
  }
 };
}
