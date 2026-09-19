import {randomUUID,createHash} from 'node:crypto';
import {HttpError} from './model.mjs';
import {validateOpportunity,matchOpportunityContractor,draftOutreach,validatePendingUpdate,validateConfirmation,OPPORTUNITY_STATUSES} from './opportunities.mjs';
import {validId} from './opportunity-storage.mjs';

const now=()=>new Date().toISOString();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject=(status,message)=>{throw new HttpError(status,message);};
function contactFor(o,id){validId(id);return o.contacts[id]||reject(400,'Select this contractor before continuing.');}
function audit(o,action,details={}){o.history.push({id:randomUUID(),at:now(),actor:'Tri-Point administrator',action,...details});}
function assertRevision(o,revision){if(revision!==o.revision)reject(409,'This opportunity changed. Refresh and review the current version.');}
function assertIdle(o,b){if(Object.values(o.contacts).some(c=>(c.sendState==='sending'||c.sendState==='uncertain')&&!(b.action==='reconcile-delivery'&&b.contractorId===c.contractorId)))reject(409,'An email attempt requires reconciliation before this opportunity can be changed.');
 if(o.pendingUpdates.some(u=>u.status==='applying'&&!(b.action==='review-update'&&b.updateId===u.id&&b.decision==='approve')))reject(409,'A profile approval is being applied. Refresh and complete that review before other changes.');
}

// Dependencies are injected for synthetic tests. The production route always supplies private Blob storage.
export function createOpportunityService(store,delivery) {
 const envelope=opportunity=>({opportunity,delivery:delivery.configuration()});
 async function save(o,etag){o.revision++;o.updatedAt=now();await store.saveOpportunity(o,etag);return envelope(o);}
 return {
  async get(query){
   if(!query.id){const p=await store.pageOpportunities(query.cursor);return {opportunities:p.records.map(o=>({id:o.id,title:o.title,revision:o.revision,updatedAt:o.updatedAt,contacts:Object.keys(o.contacts||{}).length})),cursor:p.cursor,hasMore:p.hasMore,delivery:delivery.configuration()};}
   const {record:o}=await store.readOpportunity(validId(query.id));
   if(!query.matches)return envelope(o);
   const p=await store.pageProfiles(query.cursor);
   return {...envelope(o),contractors:p.records.map(profile=>({profile,match:matchOpportunityContractor(profile,o)})).sort((a,b)=>b.match.score-a.match.score),cursor:p.cursor,hasMore:p.hasMore};
  },
  async mutate(b){
   if(b.action==='create'){
    const o={...validateOpportunity(b.opportunity),id:randomUUID(),revision:1,createdAt:now(),updatedAt:now(),contacts:{},pendingUpdates:[],history:[]};
    audit(o,'Opportunity created');await store.saveOpportunity(o);return envelope(o);
   }
   const {record:o,etag}=await store.readOpportunity(validId(b.id));assertRevision(o,b.revision);assertIdle(o,b);
   if(b.action==='reconcile-delivery'){
    const c=contactFor(o,b.contractorId);
    if(!['sending','uncertain'].includes(c.sendState)||b.confirm!==true||!['accepted','not-sent'].includes(b.outcome)||typeof b.evidence!=='string'||b.evidence.trim().length<10||b.evidence.length>2000)reject(400,'Confirm the provider outcome and record supporting evidence.');
    if(!Number.isFinite(Date.parse(c.approvedAt))||Date.now()-Date.parse(c.approvedAt)<60000)reject(409,'Wait at least one minute for the in-flight provider request to finish before reconciliation.');
    if(b.outcome==='accepted'){
     if(typeof b.providerId!=='string'||!b.providerId.trim()||b.providerId.length>200)reject(400,'Record the provider message ID for accepted delivery.');
     c.status='Sent';c.sendState='sent';c.sentAt=now();c.providerId=b.providerId.trim();
    }else{
     c.history.push({at:now(),action:'Provider confirmed not sent',draft:structuredClone(c.draft)});
     delete c.draft;c.status='Not Contacted';c.sendState='not-sent';
    }
    audit(o,'Delivery manually reconciled',{contractorId:c.contractorId,outcome:b.outcome,evidence:b.evidence.trim(),providerId:c.providerId||null});return save(o,etag);
   }
   if(b.action==='update'){
    Object.assign(o,validateOpportunity(b.opportunity));
    for(const c of Object.values(o.contacts))if(c.draft&&!c.sentAt){delete c.draft;c.status='Not Contacted';}
    audit(o,'Requirements and disclosure updated; unsent drafts invalidated');return save(o,etag);
   }
   if(b.action==='select'){
    if(!Array.isArray(b.contractorIds)||b.contractorIds.length>250)reject(400,'Select at most 250 contractors.');
    const ids=[...new Set(b.contractorIds.map(validId))];
    for(const id of ids)await store.readProfile(id);
    for(const c of Object.values(o.contacts))c.selected=ids.includes(c.contractorId);
    for(const id of ids)o.contacts[id]={contractorId:id,status:'Not Contacted',history:[],...o.contacts[id],selected:true};
    audit(o,'Contractors manually selected',{contractorIds:ids});return save(o,etag);
   }
   if(b.action==='draft'){
    const c=contactFor(o,b.contractorId);if(!c.selected)reject(400,'Manually select this contractor first.');
    if(c.sentAt)reject(409,'Outreach was already sent for this contractor. Review the response before further contact.');
    const {record:p}=await store.readProfile(c.contractorId);
    if(p.consent!==true)reject(400,'Operational contact permission must be confirmed.');
    const generated=draftOutreach(o,p);
    c.draft={...generated,id:randomUUID(),to:p.email,createdAt:now(),fingerprint:hash({generated,email:p.email})};c.status='Draft Ready';
    audit(o,'Outreach drafted',{contractorId:c.contractorId,draftId:c.draft.id});return save(o,etag);
   }
   if(b.action==='approve-send'||b.action==='test-draft'){
    const c=contactFor(o,b.contractorId);
    if(b.confirm!==true||!c.selected||!c.draft||b.draftId!==c.draft.id||c.status!=='Draft Ready'||c.sentAt)reject(400,'Review and explicitly approve the current selected contractor draft.');
    const {record:p}=await store.readProfile(c.contractorId);
    const generated=draftOutreach(o,p);
    if(p.consent!==true||hash({generated,email:p.email})!==c.draft.fingerprint)reject(409,'The contractor profile or disclosure changed. Generate and review a fresh draft.');
    const config=delivery.configuration();
    if(b.action==='test-draft'){
     if(!config.preview)reject(400,'Synthetic draft validation is available only in preview.');
     audit(o,'Synthetic draft validation; no email sent',{contractorId:c.contractorId,draftId:c.draft.id});
     return {...await save(o,etag),simulated:true};
    }
    if(!config.enabled||config.preview)reject(503,'Email delivery is disabled. Preview never sends email; a verified production sender must be configured first.');
    c.sendState='sending';c.approvedAt=now();c.approvedDraftId=c.draft.id;
    audit(o,'Draft manually approved; send reserved',{contractorId:c.contractorId,draftId:c.draft.id});
    await save(o,etag); // Atomic conditional write prevents two sessions sending the same draft.
    try {
     const receipt=await delivery.send({to:c.draft.to,subject:c.draft.subject,body:c.draft.body,id:c.draft.id});
     const fresh=await store.readOpportunity(o.id);const sent=fresh.record.contacts[c.contractorId];
     sent.status='Sent';sent.sendState='sent';sent.sentAt=now();sent.providerId=receipt.providerId;
     audit(fresh.record,'Email provider accepted approved draft',{contractorId:c.contractorId,draftId:c.draft.id,providerId:receipt.providerId});
     return save(fresh.record,fresh.etag);
    }catch(error){
     // Never retry automatically: a timeout can occur after provider acceptance.
     try{const fresh=await store.readOpportunity(o.id);fresh.record.contacts[c.contractorId].sendState='uncertain';audit(fresh.record,'Email outcome requires provider reconciliation',{contractorId:c.contractorId});await save(fresh.record,fresh.etag);}catch{}
     reject(502,'Email outcome requires administrator reconciliation with the provider. No automatic retry will occur.');
    }
   }
   if(b.action==='record-response'){
    const c=contactFor(o,b.contractorId);
    if(!OPPORTUNITY_STATUSES.includes(b.status)||['Not Contacted','Draft Ready','Sent'].includes(b.status))reject(400,'Choose a response or selection status. Sent is recorded only after approved delivery.');
    if(!Array.isArray(b.profileChanges||[])||(b.profileChanges||[]).length>20)reject(400,'Invalid proposed profile changes.');
    const {record:p}=await store.readProfile(c.contractorId);
    const changes=(b.profileChanges||[]).map(validatePendingUpdate);
    if(new Set(changes.map(x=>x.field)).size!==changes.length)reject(400,'Only one proposal per profile field is allowed in a response.');
    c.confirmations=validateConfirmation(b.confirmations||{});c.status=b.status;
    c.history.push({at:now(),status:c.status,confirmations:structuredClone(c.confirmations)});
    for(const change of changes){if(JSON.stringify(p[change.field]??null)===JSON.stringify(change.proposedValue))continue;o.pendingUpdates.push({...change,id:randomUUID(),contractorId:c.contractorId,oldValue:p[change.field]??null,createdAt:now()});}
    audit(o,'Response recorded; permanent changes queued for review',{contractorId:c.contractorId,status:c.status});return save(o,etag);
   }
   if(b.action==='review-update'){
    const u=o.pendingUpdates.find(x=>x.id===b.updateId);if(!u||!['pending','applying'].includes(u.status)||!['approve','reject'].includes(b.decision))reject(400,'Choose a pending profile update to review.');
    if(b.decision==='approve'){
     // Reserve the decision before touching the profile, so a simultaneous rejection cannot win later.
     if(u.status==='pending'){u.status='applying';audit(o,'Profile approval reserved',{updateId:u.id});await save(o,etag);}
     const {record:p,etag:profileEtag}=await store.readProfile(u.contractorId);
     const previouslyApplied=(p.profileUpdateAudit||[]).some(x=>x.updateId===u.id);
     if(!previouslyApplied){
      if(JSON.stringify(p[u.field]??null)!==JSON.stringify(u.oldValue)){
       const fresh=await store.readOpportunity(o.id);fresh.record.pendingUpdates.find(x=>x.id===u.id).status='pending';await save(fresh.record,fresh.etag);
       reject(409,'The profile has changed since this proposal. Reject it and record a fresh proposal before applying it.');
      }
      p[u.field]=u.proposedValue;
      // Existing internal/verified fields are untouched. The changed assertion requires fresh evidence review.
      p.needsReverification={...(p.needsReverification||{}),[u.field]:true};
      p.profileUpdateAudit=[...(p.profileUpdateAudit||[]),{updateId:u.id,opportunityId:o.id,field:u.field,oldValue:u.oldValue,newValue:u.proposedValue,approvedAt:now(),actor:'Tri-Point administrator'}];
      await store.saveProfile(p,profileEtag);
     }
     const fresh=await store.readOpportunity(o.id);const applied=fresh.record.pendingUpdates.find(x=>x.id===u.id);
     applied.status='approved';applied.reviewedAt=now();audit(fresh.record,'Profile proposal approved',{updateId:u.id,contractorId:u.contractorId});return save(fresh.record,fresh.etag);
    }
    u.status=b.decision==='approve'?'approved':'rejected';u.reviewedAt=now();
    audit(o,'Profile proposal '+u.status,{updateId:u.id,contractorId:u.contractorId});return save(o,etag);
   }
   reject(400,'Unknown opportunity operation.');
  }
 };
}
