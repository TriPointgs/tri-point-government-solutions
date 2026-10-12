import {HttpError} from './model.mjs';
export function zoomMailConfiguration(env=process.env){
 const from=env.TP_ZOOM_ALERT_FROM||env.TP_SIGNUP_EMAIL_FROM||'';
 const to=env.TP_ZOOM_NOTIFY_TO||'info@tripointgs.com';
 const allowedFrom=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@send\.tripointgs\.com$/i.test(from);
 const configured=!!env.RESEND_API_KEY&&allowedFrom&&to==='info@tripointgs.com';
 return {preview:env.VERCEL_ENV!=='production',enabled:env.VERCEL_ENV==='production'&&env.TP_ZOOM_ALERTS_ENABLED==='true'&&configured,remindersEnabled:env.VERCEL_ENV==='production'&&env.TP_ZOOM_REMINDERS_ENABLED==='true'&&configured,from,to};
}
export function alertMessage(lead){return {subject:'New Zoom licensing inquiry — Tri-Point',text:[
 'A Zoom licensing inquiry has been saved in the private Tri-Point sales workspace.',
 'Reference: '+lead.id,'Product: '+lead.inquiry.product,'','Review the organization, contact, deadline and request details after signing in:',
 'https://tripointgs.com/contractors/admin/zoom','',
 'No price, eligibility or quote has been approved. This internal alert intentionally excludes customer notes and procurement details.'
].join('\n')};}
export function reminderMessage(day,followUp,renewal){return {subject:'Zoom sales follow-up and renewal reminder — '+day,text:[
 'Private Zoom sales reminders for '+day+'.',
 'Open leads due for follow-up: '+followUp,
 'Open leads due for renewal review: '+renewal,'',
 'Review the due items in the administrator workspace:',
 'https://tripointgs.com/contractors/admin/zoom','',
 'A lead can be included in both counts. Won, Lost and test records are excluded. No customer email was sent.'
].join('\n')};}
async function transmit(message,key,{env=process.env,fetcher=fetch}={}){
 const c=zoomMailConfiguration(env);
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:c.from,to:[c.to],...message}),signal:AbortSignal.timeout(10000)});
 if(!response.ok){const error=new HttpError(502,'The internal alert could not be accepted.');error.deliveryState=response.status>=400&&response.status<500&&response.status!==429?'failed':'uncertain';throw error;}
 const result=await response.json();if(!result?.id){const error=new HttpError(502,'The email acceptance receipt was missing.');error.deliveryState='uncertain';throw error;}
 return {messageId:result.id};
}
export async function sendZoomAlert(lead,options={}){
 const c=zoomMailConfiguration(options.env);
 if(!c.enabled||lead.isTest)throw new HttpError(503,'Email alerts are disabled for this environment or test record.');
 return transmit(alertMessage(lead),'tp-zoom-lead-'+lead.id,options);
}
export async function sendZoomReminders(day,followUp,renewal,options={}){
 if(!zoomMailConfiguration(options.env).remindersEnabled)throw new HttpError(503,'Reminder email is disabled.');
 return transmit(reminderMessage(day,followUp,renewal),'tp-zoom-reminders-'+day,options);
}
