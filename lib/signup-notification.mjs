import {HttpError} from './model.mjs';
export function notificationConfiguration(env=process.env){
 const preview=env.VERCEL_ENV!=='production';
 return {preview,enabled:!preview&&env.TP_SIGNUP_EMAIL_ENABLED==='true'&&!!env.RESEND_API_KEY&&!!env.TP_SIGNUP_EMAIL_FROM,from:env.TP_SIGNUP_EMAIL_FROM||'',to:env.TP_SIGNUP_NOTIFY_TO||'info@tripointgs.com'};
}
export function signupMessage(profile,ref){
 const company=String(profile.company||'Company').slice(0,120);
 const trade=String(profile.trade||'not provided').slice(0,60);
 const county=(profile.serviceCounties||[]).slice(0,6).join(', ')||'Not provided';
 return {subject:'New Tri-Point subcontractor application',
  text:['A new subcontractor application was saved in the private Tri-Point directory.','',
   'Company: '+company,'Service: '+trade,'Service area: '+county,
   'Crew: '+(profile.crewSize??'Not provided'),'Reference: '+ref,'',
   'Review the full application at https://tripointgs.com/contractors/admin',
   'This internal notification must not be forwarded to other contractors.'].join('\n')};
}
export async function notifySignup(profile,reference,{env=process.env,fetcher=fetch}={}){
 const cfg=notificationConfiguration(env);
 if(!cfg.enabled)return {status:'disabled'};
 if(cfg.to!=='info@tripointgs.com')throw new HttpError(503,'Notification recipient is not authorized.');
 if(!/^[^@\s]+@(?:[a-z0-9-]+\.)?tripointgs\.com$/i.test(cfg.from))throw new HttpError(503,'The notification sender must use the Tri-Point domain.');
 const message=signupMessage(profile,reference);
 const response=await fetcher('https://api.resend.com/emails',{
  method:'POST',
  headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'new-contractor-'+reference},
  body:JSON.stringify({...message,from:cfg.from,to:[cfg.to]}),signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw new HttpError(502,'The email provider did not accept the signup notification.');
 const receipt=await response.json();
 if(!receipt?.id)throw new HttpError(502,'Notification receipt missing.');
 return {status:'accepted',messageId:receipt.id};
}
