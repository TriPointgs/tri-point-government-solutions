import {requireAdmin,requireOrigin,body,send,fail} from './security.mjs';
import {HttpError} from './model.mjs';
import {limit} from './storage.mjs';
import {createOrderTracking} from './order-tracking-service.mjs';
import {orderTrackingPage} from './order-tracking-page.mjs';
export function createOrderTrackingHandler({env=process.env,service=createOrderTracking({env}),rate=limit}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view')||'list';res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
 try{requireAdmin(req);if(env.VERCEL_ENV==='production')throw new HttpError(503,'Supplier tracking is still a private preview.');for(const k of q.keys())if(q.getAll(k).length!==1)throw new HttpError(400,'Duplicate fields.');
  if(req.method==='GET'||req.method==='HEAD'){
   if(view==='page'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':orderTrackingPage());}
   if(req.method!=='GET')throw new HttpError(405,'Use GET for tracking data.');await rate(req,'order-tracking-read',60);
   if(view==='configuration')return send(res,200,service.configuration());
   if(view==='list')return send(res,200,await service.list(q.get('cursor')||undefined));
   if(view==='record')return send(res,200,await service.read(q.get('id')));throw new HttpError(404,'Unknown tracking view.');
  }
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');requireOrigin(req);const input=await body(req,2500);await rate(req,'order-tracking-check',10);
  if(input.action==='track'){if(Object.keys(input).some(k=>!['action','referenceType','reference'].includes(k)))throw new HttpError(400,'Unexpected tracking fields.');const result=await service.track({referenceType:input.referenceType,reference:input.reference});return send(res,result.created?201:200,result);}
  if(input.action==='refresh'){if(Object.keys(input).some(k=>!['action','id','revision'].includes(k))||!Number.isSafeInteger(input.revision)||input.revision<0)throw new HttpError(400,'Invalid tracking refresh.');return send(res,200,{record:await service.refresh(input.id,input.revision)});}
  throw new HttpError(400,'Unsupported tracking action.');
 }catch(e){if(view==='page'&&e.status===401){res.statusCode=303;res.setHeader('Location','/login?next=%2Fadmin%2Ffulfillment');return res.end();}return fail(res,e instanceof HttpError?e:new HttpError(503,'Supplier tracking is temporarily unavailable. No order was submitted.'));}
};}
