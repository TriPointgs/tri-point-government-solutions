import {HttpError,matchContractor} from '../lib/model.mjs';
import {body,requireOrigin,requireAdmin,equal,setAdminCookie,send,fail} from '../lib/security.mjs';
import {limit,applicationPage,deleteApplication} from '../lib/storage.mjs';
export default async function handler(req,res){try{
 if(req.method==='GET'){requireAdmin(req);const q=new URL(req.url,'https://tripointgs.com').searchParams;const cursor=q.get('cursor');if(cursor&&cursor.length>2000)throw new HttpError(400,'Invalid cursor.');return send(res,200,await applicationPage(cursor));}
 if(!['POST','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, DELETE');throw new HttpError(405,'Method not allowed.');}
 requireOrigin(req);const b=await body(req);
 if(req.method==='POST'&&b.action==='login'){
  await limit(req,'login',5);if(!process.env.TP_ADMIN_PASSWORD||process.env.TP_ADMIN_PASSWORD.length<24)throw new HttpError(503,'Administrator access is not configured.');if(typeof b.password!=='string'||b.password.length>200||!equal(b.password,process.env.TP_ADMIN_PASSWORD))throw new HttpError(401,'Sign-in was not accepted.');setAdminCookie(res,true);return send(res,200,{ok:true});
 }
 requireAdmin(req);
 if(b.action==='logout'){setAdminCookie(res,false);return send(res,200,{ok:true});}
 if(req.method==='DELETE'&&b.action==='delete'&&b.confirm===true){await deleteApplication(b.id);return send(res,200,{ok:true});}
 throw new HttpError(400,'Unknown operation.');
 }catch(e){return fail(res,e);}}
