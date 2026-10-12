import {HttpError} from '../lib/model.mjs';
import {validatePendingUpdate} from '../lib/opportunities.mjs';
import {requireOrigin,body,send,fail} from '../lib/security.mjs';
import {opportunityStore} from '../lib/opportunity-storage.mjs';
import {authConfiguration,verifiedProfile} from '../lib/contractor-auth.mjs';

const EXPOSED=['id','company','contact','email','phone','website','trade','additionalServices','zip','state','serviceCounties','statewide','travelRadius','crewSize','maxProject','yearsInBusiness','experience','availability','licensed','insured','workersComp','certifications','equipment','description','needsReverification'];
const EDITABLE=['contact','phone','website','trade','additionalServices','state','serviceCounties','statewide','travelRadius','crewSize','maxProject','yearsInBusiness','experience','availability','licensed','insured','workersComp','certifications','equipment'];
const REVIEW_FIELDS=new Set(['trade','additionalServices','state','serviceCounties','statewide','travelRadius','crewSize','maxProject','yearsInBusiness','experience','availability','licensed','insured','workersComp','certifications','equipment']);
const snapshot=profile=>Object.fromEntries(EXPOSED.map(key=>[key,profile[key]??null]));
function validateContact(field,value){
 if(typeof value!=='string'||value.length>(field==='contact'?100:field==='phone'?40:250))throw new HttpError(400,'Invalid '+field+' field.');
 const s=value.trim();
 if(field==='contact'&&!s)throw new HttpError(400,'Contact name is required.');
 if(field==='website'&&s){let url;try{url=new URL(s);}catch{throw new HttpError(400,'Invalid website address.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new HttpError(400,'Invalid website address.');}
 return s;
}
export function safeOwnProfile(profile){return snapshot(profile);}
export function updateOwnProfile(profile,changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new HttpError(400,'Invalid profile update.');
 const fields=Object.keys(changes);
 if(fields.length>18||fields.some(field=>!EDITABLE.includes(field)))throw new HttpError(403,'Only your own editable company details can be changed.');
 const p=structuredClone(profile),stamp=new Date().toISOString(),audit=[];
 for(const field of fields){
  const proposed=REVIEW_FIELDS.has(field)?validatePendingUpdate({field,proposedValue:changes[field],evidence:'Verified contractor profile edit'}).proposedValue:validateContact(field,changes[field]);
  if(JSON.stringify(p[field]??null)===JSON.stringify(proposed))continue;
  audit.push({field,oldValue:p[field]??null,newValue:proposed,at:stamp,actor:'verified contractor'});
  p[field]=proposed;
  if(REVIEW_FIELDS.has(field))p.needsReverification={...(p.needsReverification||{}),[field]:true};
 }
 if(audit.length){p.updatedAt=stamp;p.profileUpdateAudit=[...(p.profileUpdateAudit||[]),...audit].slice(-250);}
 return {record:p,changes:audit.length};
}
export default async function handler(req,res){
 try{
  if(!authConfiguration().enabled)throw new HttpError(503,'Contractor profile access is not active yet.');
  const {record,etag}=await verifiedProfile(req);
  if(req.method==='GET')return send(res,200,{profile:safeOwnProfile(record)});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
  requireOrigin(req);
  const b=await body(req);
  if(b.action!=='update')throw new HttpError(400,'Invalid profile action.');
  const next=updateOwnProfile(record,b.changes);
  if(next.changes)await opportunityStore.saveProfile(next.record,etag);
  return send(res,200,{profile:safeOwnProfile(next.record),updatedFields:next.changes});
 }catch(e){return fail(res,e);}
}
