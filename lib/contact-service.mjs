import {HttpError} from './model.mjs';
import {digest} from './security.mjs';
import {validateContact,contactId,contactConfiguration,contactMessage} from './contact-model.mjs';
import {createContactStore} from './contact-store.mjs';
export async function sendContactAlert(record,{env=process.env,fetcher=fetch}={}){
 const c=contactConfiguration(env);if(record.isTest||!c.emailEnabled)return {status:'disabled'};
 let response;try{response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'contact-inquiry-'+record.id},body:JSON.stringify({from:c.from,to:[c.to],...contactMessage(record)}),signal:AbortSignal.timeout(10000)});}catch{const e=new HttpError(502,'Alert outcome requires review.');e.deliveryState='uncertain';throw e;}
 if(!response.ok){const e=new HttpError(502,'Alert was not confirmed.');e.deliveryState=response.status>=400&&response.status<500&&response.status!==429&&response.status!==409?'failed':'uncertain';throw e;}
 const data=await response.json();if(!data?.id){const e=new HttpError(502,'Alert receipt missing.');e.deliveryState='uncertain';throw e;}return {status:'accepted',messageId:data.id};
}
export function createContactService({env=process.env,store=createContactStore({env}),clock=()=>new Date().toISOString(),mailer=record=>sendContactAlert(record,{env})}={}){
 async function notify(id){
  const c=contactConfiguration(env);let {record,etag}=await store.read(id);
  if(record.isTest||!c.emailEnabled)return {status:'disabled'};
  if(record.notification.status!=='pending')return record.notification;
  const claimed={...record,revision:record.revision+1,notification:{status:'sending',attemptedAt:clock()}};
  await store.save(claimed,etag);let result;
  try{const r=await mailer(claimed);result={status:r.status,messageId:r.messageId,attemptedAt:claimed.notification.attemptedAt,acceptedAt:r.status==='accepted'?clock():null};}catch(e){result={status:e.deliveryState==='failed'?'failed':'uncertain',attemptedAt:claimed.notification.attemptedAt};}
  for(let i=0;i<3;i++){const latest=await store.read(id);try{await store.save({...latest.record,revision:latest.record.revision+1,notification:result},latest.etag);return result;}catch(e){if(e.status!==409||i===2)throw e;}}
 }
 return {
  async submit(input,id){const cfg=contactConfiguration(env);if(!cfg.intakeEnabled)throw new HttpError(503,'Website inquiries are not yet enabled. Please use the contact address shown on this page.');contactId(id);const inquiry=validateContact(input),submissionHash=digest(JSON.stringify(inquiry)),at=clock();
   const record={id,revision:1,createdAt:at,isTest:cfg.preview,status:'new',inquiry,submissionHash,notification:{status:cfg.preview||!cfg.emailEnabled?'disabled':'pending'},history:[]};
   const saved=await store.create(record);if(saved.record.submissionHash!==submissionHash||saved.record.isTest!==cfg.preview)throw new HttpError(409,'This reference was already used for a different request. Reload to start a new request.');
   let notification=saved.record.notification;try{notification=await notify(id);}catch{notification={status:'unconfirmed'};}
   return {id,created:saved.created,isTest:saved.record.isTest,notificationStatus:notification.status,message:cfg.preview?'Preview request saved. No email was sent, and this is not a live quote request.':'Your request was saved for Tri-Point review. Keep this reference. It is not a quotation or order.'};
  },
  async list(cursor){const page=await store.page(cursor);return {...page,records:page.records.map(r=>({id:r.id,revision:r.revision,createdAt:r.createdAt,isTest:r.isTest,status:r.status,notificationStatus:r.notification.status,inquiry:{organization:r.inquiry.organization,name:r.inquiry.name,email:r.inquiry.email,manufacturer:r.inquiry.manufacturer,topic:r.inquiry.topic}}))};},
  async get(id){return (await store.read(contactId(id))).record;},
  async reviewed(id,revision){const {record,etag}=await store.read(contactId(id));if(record.status==='reviewed')return {id:record.id,status:record.status,revision:record.revision};if(!Number.isSafeInteger(revision)||record.revision!==revision)throw new HttpError(409,'Inquiry changed. Refresh before marking reviewed.');const updated={...record,status:'reviewed',revision:record.revision+1,history:[...record.history,{action:'reviewed',at:clock()}]};await store.save(updated,etag);return {id:updated.id,status:updated.status,revision:updated.revision};}
 };
}
