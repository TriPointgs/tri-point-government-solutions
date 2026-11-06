import {requireAdmin,requireOrigin,body,send} from './security.mjs';
import {limit} from './storage.mjs';import {HttpError} from './model.mjs';
import {orderId} from './order-extension-store.mjs';
import {createOrderMail} from './order-mail.mjs';
import {orderMailPage,orderMailVerifyPage} from './order-mail-pages.mjs';
export function createOrderMailHandler({env=process.env,service=createOrderMail({env}),rate=limit}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view');res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{if(env.VERCEL_ENV!=='preview')throw new HttpError(503,'Notification testing is restricted to private preview.');
  for(const k of q.keys())if(!['view','id'].includes(k)||q.getAll(k).length!==1)throw new HttpError(400,'Invalid notification query.');
  if(view==='cart-checkout-mail-verify-page'&&!q.has('id')&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':orderMailVerifyPage());}
  if(view==='cart-checkout-mail-confirm'&&!q.has('id')&&req.method==='POST'){requireOrigin(req);await rate(req,'order-mail-confirm',8);return send(res,200,await service.confirm(await body(req,600)));}
  requireAdmin(req);
  if(view==='cart-checkout-mail-page'&&!q.has('id')&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':orderMailPage());}
  if(view==='cart-checkout-mail-status'&&req.method==='GET'){await rate(req,'order-mail-status',20);return send(res,200,await service.read(orderId(q.get('id'))));}
  if(view==='cart-checkout-mail-action'&&!q.has('id')&&req.method==='POST'){requireOrigin(req);await rate(req,'order-mail-action',6);const {action,...input}=await body(req,1600);if(action==='challenge')return send(res,200,await service.challenge(input));if(action==='notify')return send(res,200,await service.notify(input));if(action==='reconcile')return send(res,200,await service.reconcile(input));if(action==='revoke')return send(res,200,await service.revoke(input));}
  throw new HttpError(405,'Unsupported notification action.');
 }catch(e){if(e.status===401&&view==='cart-checkout-mail-page'){res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/admin/order-notifications'));return res.end();}return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'The notification operation could not be verified. Reload the same order; do not resend.'});}
};}
