import {validateApplication,HttpError} from '../lib/model.mjs';
import {body,challenge,verify,requireOrigin,send,fail} from '../lib/security.mjs';
import {limit,saveApplication} from '../lib/storage.mjs';
export default async function handler(req,res){try{
 if(req.method==='GET'){return send(res,200,{challenge:challenge()});}
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
 requireOrigin(req);const b=await body(req);
 if(b.faxNumber)throw new HttpError(400,'Unable to accept this application.');
 const token=verify(b.challenge,'intake',2*3600000);if(!token||Date.now()-token.at<2000)throw new HttpError(400,'Please reload the form and try again.');
 const p=validateApplication(b);await limit(req,'intake',3);const receipt=await saveApplication(token.id,p);
 return send(res,201,{ok:true,...receipt,message:'Your application was saved. Enrollment is not a contract award or a verification of eligibility.'});
 }catch(e){return fail(res,e);}}
