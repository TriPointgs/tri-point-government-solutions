// Bounded Resend transport. No retries, redirects, recipient discovery or provider-wide listing.
import {fault,hash} from './order-extension-store.mjs';
export const mailId=x=>{if(typeof x!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x))fault('Invalid email reference.');return x;};
export function mailAddress(x){if(typeof x!=='string'||x.length>254||!/^[-A-Za-z0-9_+]+(?:[.][-A-Za-z0-9_+]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$/.test(x)||x.split('@')[0].length>64)fault('A single plain email address is required.');return x;}
export const envelopeHash=e=>hash([e.from,e.to,e.subject,e.text,e.html]);
export const mailEvents=new Set(['bounced','canceled','clicked','complained','delivered','delivery_delayed','failed','opened','queued','scheduled','sent','suppressed']);
export function validateMailObservation(d,a,config,now){
 mailId(d?.id);const at=Date.parse(d.created_at),start=Date.parse(a.at);
 if(d.object!=='email'||(a.providerId&&a.providerId!==d.id)||d.from!==config.from||!Array.isArray(d.to)||d.to.length!==1||d.to[0]!==config.to||!['cc','bcc','reply_to'].every(k=>Array.isArray(d[k])&&d[k].length===0)||d.scheduled_at!=null||!mailEvents.has(d.last_event)||!Number.isFinite(at)||at<start-30000||at>start+120000||at>now+30000||envelopeHash(d)!==a.payloadHash)fault('The provider email does not match the saved exact attempt.',409);
 return {providerId:d.id,state:d.last_event,checkedAt:new Date(now).toISOString()};
}
export function createOrderMailProvider({env=process.env,fetcher=fetch}={}){
 const environment=Object.freeze({...env});
 async function request(path,options={}){
  if(environment.VERCEL_ENV!=='preview'||!/^re_[A-Za-z0-9_-]{8,}$/.test(environment.TP_ORDER_MAIL_API_KEY||''))fault('Private notification transport is not configured.',503);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetcher('https://api.resend.com'+path,{...options,redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+environment.TP_ORDER_MAIL_API_KEY,'Content-Type':'application/json',...options.headers}});if(!r.ok)fault('Email provider request could not be verified. Reconcile the existing attempt.',503);
   const reader=r.body?.getReader();if(!reader)fault('Unreadable email provider response.',503);let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>64000){await reader.cancel();fault('Email provider response exceeded its limit.',503);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fault('Unreadable email provider response.',503);}
  }catch{fault('Email provider request could not be verified. Reconcile the existing attempt.',503);}finally{clearTimeout(timer);}
 }
 return {
  async checkDomain(config){const d=await request('/domains/'+mailId(config.domainId));if(d.id!==config.domainId||d.name!==config.from.split('@')[1]||d.status!=='verified'||d.capabilities?.sending!=='enabled'||d.open_tracking!==false||d.click_tracking!==false)fault('The exact sender domain must be verified, sending-enabled and have tracking disabled.',409);return true;},
  async send(envelope,key){mailAddress(envelope.from);if(!Array.isArray(envelope.to)||envelope.to.length!==1)fault('One approved email recipient is required.');mailAddress(envelope.to[0]);if(typeof key!=='string'||!/^tp-mail-v1\/[a-f0-9]{64}\/[a-f0-9-]{36}\/(verification|notification)$/.test(key))fault('Invalid email attempt key.');const d=await request('/emails',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(envelope)});return {id:mailId(d?.id)};},
  get:id=>request('/emails/'+mailId(id))
 };
}
