import {randomUUID} from 'node:crypto';
import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,sign,verify,send,fail} from '../lib/security.mjs';
import {limit} from '../lib/storage.mjs';
import {contactConfiguration} from '../lib/contact-model.mjs';
import {createContactService} from '../lib/contact-service.mjs';
import {contactAdminPage} from '../lib/contact-page.mjs';
export function createContactHandler({env=process.env,service=createContactService({env}),rate=limit,clock=()=>Date.now()}={}){return async(req,res)=>{
 const params=new URL(req.url,'https://tripointgs.com').searchParams,view=params.get('view')||'public';res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{
  if(['admin','admin-page'].includes(view)){
   requireAdmin(req);
   if(view==='admin-page'){if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Method not allowed.');res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=200;return res.end(req.method==='HEAD'?'':contactAdminPage());}
   if(req.method==='GET')return send(res,200,params.get('id')?await service.get(params.get('id')):await service.list(params.get('cursor')));
   if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');requireOrigin(req);const b=await body(req,2048);if(b.action!=='mark-reviewed'||Object.keys(b).some(k=>!['action','id','revision'].includes(k)))throw new HttpError(400,'Invalid review action.');return send(res,200,await service.reviewed(b.id,b.revision));
  }
  if(view!=='public')throw new HttpError(404,'Not found.');
  const cfg=contactConfiguration(env);
  if(req.method==='GET'){await rate(req,'contact-challenge',20);return send(res,200,{enabled:cfg.intakeEnabled,preview:cfg.preview,challenge:cfg.intakeEnabled?sign({type:'contact-request',id:randomUUID(),at:clock(),preview:cfg.preview}):null});}
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
  if(!cfg.intakeEnabled)throw new HttpError(503,'Website inquiries are not yet enabled.');
  requireOrigin(req);const b=await body(req,16384);if(b.faxNumber)throw new HttpError(400,'Unable to accept the request.');
  const token=verify(b.challenge,'contact-request',2*3600000);if(!token||clock()-token.at<2000||token.preview!==cfg.preview)throw new HttpError(400,'The secure form expired or changed. Reload the page and try again.');
  await rate(req,'contact-submit',3);const result=await service.submit(b,token.id);return send(res,result.created?201:200,{ok:true,...result});
 }catch(e){if(view==='admin-page'&&e.status===401){res.statusCode=303;res.setHeader('Location','/login');return res.end();}return fail(res,e);}
};}
export default createContactHandler();
