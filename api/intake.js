import {HttpError} from '../lib/model.mjs';
import {validateSubcontractorApplication} from '../lib/subcontractor-intake.mjs';
import {body,challenge,verify,requireOrigin,send,fail} from '../lib/security.mjs';
import {limit,saveApplication} from '../lib/storage.mjs';
import {notifySignup} from '../lib/signup-notification.mjs';
export default async function handler(req,res){try{
 if(req.method==='GET'){return send(res,200,{challenge:challenge(),preview:process.env.VERCEL_ENV!=='production',applicantEmail:'not_sent'});}
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
 requireOrigin(req);const b=await body(req);
 if(b.faxNumber)throw new HttpError(400,'Unable to accept this application.');
 const token=verify(b.challenge,'intake',2*3600000);if(!token||Date.now()-token.at<2000)throw new HttpError(400,'Please reload the form and try again.');
 const p=validateSubcontractorApplication(b);await limit(req,'intake',3);const receipt=await saveApplication(token.id,p);
 let notification={status:'unconfirmed'};try{notification=await notifySignup(p,receipt.id);}catch(error){console.error('Signup notification unavailable for saved application',receipt.id,error?.name||'Error');}
 return send(res,201,{ok:true,...receipt,preview:process.env.VERCEL_ENV!=='production',applicantEmail:'not_sent',internalNotification:notification.status,message:'Your application was saved. Enrollment is not a contract award or a verification of eligibility.'});
 }catch(e){return fail(res,e);}}
