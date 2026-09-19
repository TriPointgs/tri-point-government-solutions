import {HttpError} from './model.mjs';

export function deliveryConfiguration() {
 const preview=process.env.VERCEL_ENV!=='production';
 return {preview,enabled:!preview&&process.env.TP_OUTREACH_ENABLED==='true'&&!!process.env.RESEND_API_KEY&&!!process.env.TP_OUTREACH_FROM};
}
// Only the manually approved, persisted draft is accepted. No opportunity object enters the mail transport.
export async function deliverApprovedDraft({to,subject,body,id}) {
 if(!deliveryConfiguration().enabled)throw new HttpError(503,'Email delivery is disabled. Configure and verify the Tri-Point sender before sending. Preview never sends email.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||/[\r\n]/.test(subject))throw new HttpError(400,'Invalid email envelope.');
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':id},
  body:JSON.stringify({from:process.env.TP_OUTREACH_FROM,to:[to],reply_to:process.env.TP_OUTREACH_REPLY_TO||'info@tripointgs.com',subject,text:body}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw new HttpError(502,'The email provider did not confirm delivery. Reconcile this attempt before sending again.');
 const result=await response.json();
 if(typeof result.id!=='string')throw new HttpError(502,'Email outcome is uncertain. Reconcile with the provider before sending again.');
 return {providerId:result.id};
}
