import {requireAdmin,requireOrigin,body,send} from './security.mjs';
import {limit} from './storage.mjs';import {HttpError} from './model.mjs';
import {orderId} from './order-extension-store.mjs';
import {createSupplierDispatch} from './supplier-dispatch.mjs';
import {createOrderUpdateQueue} from './order-update-queue.mjs';
import {fulfillmentPilotPage} from './fulfillment-pilot-page.mjs';
export function createFulfillmentPilotHandler({env=process.env,dispatch=createSupplierDispatch({env}),updates=createOrderUpdateQueue({env,dispatch}),rate=limit}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view');res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{
  if(env.VERCEL_ENV!=='preview')throw new HttpError(503,'Fulfillment pilot is restricted to private preview.');requireAdmin(req);
  for(const k of q.keys())if(!['view','id'].includes(k)||q.getAll(k).length!==1)throw new HttpError(400,'Invalid fulfillment pilot query.');
  if(view==='cart-checkout-pilot-page'&&!q.has('id')&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':fulfillmentPilotPage());}
  if(view==='cart-checkout-pilot-status'&&req.method==='GET'){await rate(req,'fulfillment-pilot-read',20);const id=orderId(q.get('id'));return send(res,200,{configuration:dispatch.configuration(),supplier:await dispatch.read(id),updates:await updates.read(id)});}
  if(view==='cart-checkout-pilot-action'&&!q.has('id')&&req.method==='POST'){
   requireOrigin(req);await rate(req,'fulfillment-pilot-write',8);const {action,...input}=await body(req,2000);
   if(action==='prepare')return send(res,200,await dispatch.prepare(input));
   if(action==='submit')return send(res,200,await dispatch.submit(input));
   if(action==='reconcile')return send(res,200,await dispatch.reconcile(input));
   if(action==='sync-updates')return send(res,200,await updates.sync(input));
  }
  throw new HttpError(405,'Unsupported fulfillment pilot operation.');
 }catch(e){if(e.status===401&&view==='cart-checkout-pilot-page'){res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/admin/fulfillment-pilot'));return res.end();}return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'The saved operation could not be confirmed. Reload the same order; do not create a replacement supplier attempt.'});}
};}
