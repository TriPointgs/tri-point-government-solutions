import {HttpError} from './model.mjs';

// The legacy "reviewed" status is displayed to staff as "Under review".
// A decision is not a certification, a supplier award, or proof of eligibility.
export const DECISIONS=Object.freeze(['mark-reviewed','approve','decline']);
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const statusLabel=status=>({
 new:'New application',reviewed:'Under review',approved:'Approved for network',declined:'Declined',
 suspended:'Suspended'
}[status||'new']||'Under review');

export function welcomeEmail(profile){
 if(!profile||profile.status!=='reviewed'&&profile.status!=='approved')throw new HttpError(409,'Review the application before preparing a welcome email.');
 const address=String(profile.email||'').trim();
 if(!emailPattern.test(address)||address.length>254)throw new HttpError(409,'A valid applicant email is required before approval.');
 const company=String(profile.company||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,100);
 return {
  to:address,
  subject:'Welcome to the Tri-Point subcontractor network',
  text:[
   'Hello,',
   '',
   'Your company'+(company?', '+company:'')+' has been approved to participate in the Tri-Point Government Solutions subcontractor network.',
   '',
   'Thank you for sharing your business capabilities. We may contact you when a relevant potential opportunity arises. Approval is not a subcontract, project assignment, verification of professional credentials, or guarantee of work.',
   '',
   'You can visit https://tripointgs.com/login to request a private link to your company profile when email sign-in is available. Do not share the sign-in link with others.',
   '',
   'If you have questions or need to update your application, reply to info@tripointgs.com.',
   '',
   'Tri-Point Government Solutions LLC'
  ].join('\n')
 };
}

export function welcomeEmailSettings(env=process.env){
 const enabled=env.VERCEL_ENV==='production'&&
  env.TP_SUBCONTRACTOR_WELCOME_ENABLED==='true'&&
  env.TP_SUBCONTRACTOR_WELCOME_APPROVED==='true'&&
  typeof env.TP_SUBCONTRACTOR_WELCOME_API_KEY==='string'&&env.TP_SUBCONTRACTOR_WELCOME_API_KEY.length>0&&
  typeof env.TP_SUBCONTRACTOR_WELCOME_FROM==='string'&&
  /^[^@\s]+@(?:[a-z0-9-]+\.)?tripointgs\.com$/i.test(env.TP_SUBCONTRACTOR_WELCOME_FROM);
 return {enabled,reason:enabled?'ready':'disabled'};
}

const allowedStatuses=Object.freeze(['new','reviewed','approved','declined']);
export function decideProfile(record,action,{expectedStatus,confirmed,at=new Date().toISOString()}={}){
 if(!record||!DECISIONS.includes(action)||!allowedStatuses.includes(record.status||'new'))
  throw new HttpError(409,'This application cannot be changed through this workflow.');
 const previous=record.status||'new';
 if(expectedStatus!==previous)throw new HttpError(409,'The application status changed. Refresh before making a decision.');
 if(confirmed!==true)throw new HttpError(400,'Confirm the exact application decision.');
 if(!record.id||!record.company||!record.email)throw new HttpError(409,'Application identity is incomplete.');
 if(action==='mark-reviewed'&&previous!=='new')throw new HttpError(409,'Only new applications can be marked under review.');
 if(action!=='mark-reviewed'&&previous!=='reviewed')throw new HttpError(409,'Only applications under review can be approved or declined.');
 if(action==='approve'){
  if(record.consent!==true)throw new HttpError(409,'This application has no affirmative network consent.');
  welcomeEmail({...record,status:'reviewed'});
 }
 const state=action==='mark-reviewed'?'reviewed':action==='approve'?'approved':'declined';
 const next={...record,status:state};
 if(state==='reviewed')next.reviewedAt=at;
 if(state==='approved'){
  next.approvedAt=at;
  next.welcomeNotice={state:'held',createdAt:at};
 }
 if(state==='declined')next.declinedAt=at;
 // Keep a bounded, staff-only decision history; do not imply identity of the shared-password operator.
 const history=Array.isArray(record.decisionHistory)?record.decisionHistory:[];
 next.decisionHistory=[...history.slice(-19),{from:previous,to:state,at,actor:'Tri-Point administrator'}];
 return next;
}

export async function saveDecision(store,id,action,options){
 const {record,etag}=await store.readProfile(id);
 const next=decideProfile(record,action,options);
 await store.saveProfile(next,etag);
 return next;
}

// Exactly one pre-provider claim in the private application record. No automatic
// retry, even after a timeout, provider error, or an unclear response.
export async function dispatchWelcomeOnce(store,id,{env=process.env,fetcher=fetch}={}){
 if(!welcomeEmailSettings(env).enabled)return {state:'held',sent:false};
 const {record,etag}=await store.readProfile(id);
 if(record.status!=='approved'||record.welcomeNotice?.state!=='held')
  throw new HttpError(409,'Welcome email is not awaiting a first attempt.');
 const message=welcomeEmail(record);
 const attemptedAt=new Date().toISOString();
 const attempt={...record,welcomeNotice:{...record.welcomeNotice,state:'attempted',attemptedAt}};
 await store.saveProfile(attempt,etag); // exclusive claim; conflicts never call the provider.
 // Confirm the durable claim is visible before any external send attempt.
 // A failed readback leaves the record held for manual reconciliation, not automatic retry.
 const confirmed=await store.readProfile(id);
 if(confirmed.record.status!=='approved'||
    confirmed.record.welcomeNotice?.state!=='attempted'||
    confirmed.record.welcomeNotice.attemptedAt!==attemptedAt)
  throw new HttpError(409,'Welcome-email send claim could not be verified. No email attempt was made.');
 let providerId=null;
 try{
  const response=await fetcher('https://api.resend.com/emails',{
   method:'POST',
   headers:{
    Authorization:'Bearer '+env.TP_SUBCONTRACTOR_WELCOME_API_KEY,
    'Content-Type':'application/json',
    'Idempotency-Key':'tp-network-welcome-'+record.id
   },
   body:JSON.stringify({...message,from:env.TP_SUBCONTRACTOR_WELCOME_FROM,to:[message.to],reply_to:['info@tripointgs.com']}),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error('Provider did not confirm acceptance');
  const receipt=await response.json();
  if(typeof receipt?.id!=='string'||!receipt.id)throw new Error('Provider response lacks an email ID');
  providerId=receipt.id;
 }catch(error){
  // Sending may have happened; never automatically resend.
  console.error('Subcontractor welcome delivery needs manual reconciliation',error?.name||'Error');
 }
 try{
  const fresh=await store.readProfile(id);
  if(fresh.record.status==='approved'&&fresh.record.welcomeNotice?.state==='attempted'&&
   fresh.record.welcomeNotice.attemptedAt===attemptedAt){
   const next={...fresh.record,welcomeNotice:{...fresh.record.welcomeNotice,
    state:providerId?'provider-accepted':'outcome-unknown',
    ...(providerId?{providerId}:{})}};
   await store.saveProfile(next,fresh.etag);
  }
 }catch(error){console.error('Subcontractor welcome result could not be saved',error?.name||'Error');}
 return {state:providerId?'provider-accepted':'outcome-unknown',sent:!!providerId};
}
