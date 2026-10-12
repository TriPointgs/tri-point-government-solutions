import {randomBytes,randomUUID} from 'node:crypto';
import {get,put} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {namespace} from './storage.mjs';
import {digest,equal,sign,verify} from './security.mjs';
import {opportunityStore} from './opportunity-storage.mjs';

export const LOGIN_LIFETIME=15*60*1000;
const COOKIE_LIFETIME=8*60*60*1000;
export function authConfiguration(env=process.env){
 const preview=env.VERCEL_ENV!=='production';
 return {enabled:!preview&&env.TP_CONTRACTOR_LOGIN_ENABLED==='true'&&!!env.RESEND_API_KEY&&!!env.TP_AUTH_EMAIL_FROM,
  from:env.TP_AUTH_EMAIL_FROM||'',preview};
}
export function normalizeEmail(email){
 if(typeof email!=='string'||email.length>254)throw new HttpError(400,'Provide a valid business email.');
 const result=email.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new HttpError(400,'Provide a valid business email.');
 return result;
}
const tokenPath=id=>namespace()+'/claim-tokens/'+id+'.json';
const markerPath=id=>namespace()+'/claim-consumed/'+id+'.json';
const exists=e=>/already.?exists|precondition/i.test((e?.name||'')+' '+(e?.message||''));
export function parseLoginToken(token){
 if(typeof token!=='string'||token.length>180)throw new HttpError(400,'Invalid or expired sign-in link.');
 const [id,secret,...extra]=token.split('.');
 if(extra.length||!/^[0-9a-f-]{36}$/.test(id||'')||!/^[a-zA-Z0-9_-]{43}$/.test(secret||''))throw new HttpError(400,'Invalid or expired sign-in link.');
 return {id,secret};
}
export function setContractorCookie(res,payload){
 const v=payload?sign({type:'contractor',at:Date.now(),profileId:payload.id,emailHash:digest(payload.email)}):'';
 res.setHeader('Set-Cookie','__Host-tp_contractor='+v+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+(payload?'28800':'0'));
}
export function sessionFromRequest(req){
 const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-tp_contractor='))?.slice('__Host-tp_contractor='.length);
 const p=verify(value,'contractor',COOKIE_LIFETIME);
 return p&&/^[0-9a-f-]{36}$/.test(p.profileId||'')&&typeof p.emailHash==='string'?p:null;
}
export function requireContractor(req){
 const session=sessionFromRequest(req);
 if(!session)throw new HttpError(401,'Sign in to access your own contractor profile.');
 return session;
}
export async function verifiedProfile(req){
 const session=requireContractor(req);
 const {record,etag}=await opportunityStore.readProfile(session.profileId);
 if(record.consent!==true||record.status==='suspended'||!equal(digest(normalizeEmail(record.email)),session.emailHash))throw new HttpError(401,'Profile access needs re-verification.');
 return {record,etag};
}
export async function findUniqueProfile(email){
 let cursor=null,count=0,match=null;
 do{
  const page=await opportunityStore.pageProfiles(cursor);
  for(const p of page.records){
   count++;
   if(count>5000)throw new HttpError(503,'Account lookup is temporarily unavailable.');
   if(p.email?.trim().toLowerCase()===email&&p.consent===true&&p.status!=='suspended'){
    if(match)return null; // Do not grant access to multiple companies via an ambiguous shared address.
    match=p;
   }
  }
  cursor=page.hasMore?page.cursor:null;
 }while(cursor);
 return match;
}
export async function limitEmailRequests(email){
 const bucket=Math.floor(Date.now()/900000);
 const key=digest('auth-request:'+email+':'+bucket).slice(0,32);
 for(let i=0;i<2;i++){
  try{await put(namespace()+'/claim-rate/'+bucket+'/'+key+'-'+i+'.json','{}',{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return;}
  catch(e){if(!exists(e))throw e;}
 }
 throw new HttpError(429,'Too many sign-in requests. Please try again later.');
}
export async function createClaimToken(profile){
 const id=randomUUID(),secret=randomBytes(32).toString('base64url');
 const record={id,hash:digest('claim-token:'+secret),profileId:profile.id,emailHash:digest(normalizeEmail(profile.email)),createdAt:Date.now()};
 await put(tokenPath(id),JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
 return id+'.'+secret;
}
export async function verifyClaimToken(token){
 const {id,secret}=parseLoginToken(token);
 const blob=await get(tokenPath(id),{access:'private',useCache:false});
 if(!blob)throw new HttpError(400,'Invalid or expired sign-in link.');
 const p=await new Response(blob.stream).json();
 if(!Number.isFinite(p.createdAt)||p.createdAt>Date.now()+30000||Date.now()-p.createdAt>LOGIN_LIFETIME||!equal(p.hash,digest('claim-token:'+secret)))throw new HttpError(400,'Invalid or expired sign-in link.');
 const {record}=await opportunityStore.readProfile(p.profileId);
 if(record.consent!==true||record.status==='suspended'||!equal(p.emailHash,digest(normalizeEmail(record.email))))throw new HttpError(401,'Profile sign-in requires administrator review.');
 // A correct link may be consumed exactly once across concurrent requests.
 try{await put(markerPath(id),'{}',{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});}
 catch(e){if(exists(e))throw new HttpError(409,'This link has already been used. Request a new sign-in link.');throw e;}
 return record;
}
export async function sendClaimEmail(profile,token,{env=process.env,fetcher=fetch}={}){
 const cfg=authConfiguration(env);
 if(!cfg.enabled||!/^\S+@(?:[a-z0-9-]+\.)?tripointgs\.com$/i.test(cfg.from))throw new HttpError(503,'Secure profile email sign-in is not configured.');
 const link='https://tripointgs.com/login#claim='+token;
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'claim-'+token.split('.')[0]},body:JSON.stringify({from:cfg.from,to:[profile.email],subject:'Your Tri-Point subcontractor profile sign-in',text:'Use this private one-time link to access your company profile (valid for 15 minutes):\n\n'+link+'\n\nIf you did not request this, you can ignore it. Do not forward the link.'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new HttpError(502,'Unable to send a secure sign-in link right now.');
 return {ok:true};
}
