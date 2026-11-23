import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {opportunityStore} from '../lib/opportunity-storage.mjs';
import {notificationConfiguration} from '../lib/signup-notification.mjs';
import {saveDecision,welcomeEmail,welcomeEmailSettings,dispatchWelcomeOnce} from '../lib/subcontractor-approval.mjs';
const isNew=p=>p.status==='new'||!p.status;
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
async function summary(){
 let cursor=null,count=0,total=0,reviewed=0,approved=0,declined=0,iterations=0;
 do{
  const page=await opportunityStore.pageProfiles(cursor);
  total+=page.records.length;
  for(const p of page.records){
   if(isNew(p))count++;
   if(p.status==='reviewed')reviewed++;
   if(p.status==='approved')approved++;
   if(p.status==='declined')declined++;
  }
  if(total>5000||++iterations>250)throw new HttpError(503,'Directory exceeds notification scan limit.');
  cursor=page.hasMore?page.cursor:null;
 }while(cursor);
 return {newCount:count,reviewedCount:reviewed,approvedCount:approved,declinedCount:declined,totalCount:total,
  emailEnabled:notificationConfiguration().enabled,welcomeEmailEnabled:welcomeEmailSettings().enabled};
}
export default async function handler(req,res){
 try{
  requireAdmin(req);
  if(req.method==='GET'){
   const q=new URL(req.url,'https://tripointgs.com').searchParams;
   if(q.get('view')==='welcome-preview'){
    const id=q.get('id');
    if(!validId(id))throw new HttpError(400,'Invalid application reference.');
    const {record}=await opportunityStore.readProfile(id);
    const message=welcomeEmail(record);
    return send(res,200,{...message,deliveryEnabled:welcomeEmailSettings().enabled,previewOnly:true});
   }
   if(q.has('view'))throw new HttpError(400,'Unknown notification view.');
   return send(res,200,await summary());
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
  requireOrigin(req);
  const b=await body(req);
  if(!validId(b.id))throw new HttpError(400,'Invalid application reference.');
  if(b.action==='send-welcome'){
   if(b.confirmed!==true)throw new HttpError(400,'Confirm the exact welcome email send.');
   if(!welcomeEmailSettings().enabled)throw new HttpError(503,'Welcome emails are not enabled. No email was sent.');
   const result=await dispatchWelcomeOnce(opportunityStore,b.id);
   return send(res,200,{ok:true,id:b.id,welcomeNotice:result.state,providerAccepted:result.sent});
  }
  if(!['mark-reviewed','approve','decline'].includes(b.action))throw new HttpError(400,'Unknown application decision.');
  const record=await saveDecision(opportunityStore,b.id,b.action,{
   expectedStatus:b.expectedStatus,
   confirmed:b.confirmed
  });
  let emailOutcome=record.welcomeNotice?.state||'not-applicable';
  if(b.action==='approve'&&welcomeEmailSettings().enabled){
   try{
    const attempt=await dispatchWelcomeOnce(opportunityStore,b.id);
    emailOutcome=attempt.state;
   }catch(error){
    // Approval is already saved; no automatic retry or rollback of the decision.
    console.error('Approved profile requires separate welcome email reconciliation',error?.name||'Error');
    emailOutcome='held-or-uncertain';
   }
  }
  return send(res,200,{ok:true,id:record.id,status:record.status,
   reviewedAt:record.reviewedAt,approvedAt:record.approvedAt,declinedAt:record.declinedAt,
   welcomeNotice:emailOutcome});
 }catch(e){return fail(res,e);}
}
