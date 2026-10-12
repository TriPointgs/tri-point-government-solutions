import {HttpError} from '../lib/model.mjs';
import {requireOrigin,body,send,fail} from '../lib/security.mjs';
import {limit} from '../lib/storage.mjs';
import {authConfiguration,normalizeEmail,findUniqueProfile,limitEmailRequests,createClaimToken,sendClaimEmail,verifyClaimToken,sessionFromRequest,setContractorCookie} from '../lib/contractor-auth.mjs';

export default async function handler(req,res){
 try{
  if(req.method==='GET')return send(res,200,{enabled:authConfiguration().enabled,signedIn:!!sessionFromRequest(req)});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
  requireOrigin(req);
  const b=await body(req);
  if(b.action==='logout'){setContractorCookie(res,null);return send(res,200,{ok:true});}
  if(!authConfiguration().enabled)throw new HttpError(503,'Contractor profile sign-in is not yet available. For updates, email info@tripointgs.com.');
  if(b.action==='request'){
   const email=normalizeEmail(b.email);
   await limit(req,'claim-login',4);
   await limitEmailRequests(email);
   const profile=await findUniqueProfile(email);
   if(profile){
    const token=await createClaimToken(profile);
    try{await sendClaimEmail(profile,token);}catch(error){console.error('Contractor sign-in email could not be sent:',error?.name||'Error');}
   }
   // No account-existence disclosure. A duplicate/unknown address gets this same answer.
   return send(res,200,{ok:true,message:'If this email matches one eligible contractor profile, a private sign-in link will arrive shortly.'});
  }
  if(b.action==='verify'){
   await limit(req,'claim-verify',6);
   const profile=await verifyClaimToken(b.token);
   setContractorCookie(res,profile);
   return send(res,200,{ok:true});
  }
  throw new HttpError(400,'Invalid login action.');
 }catch(e){return fail(res,e);}
}
