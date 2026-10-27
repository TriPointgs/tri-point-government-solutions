import {createFulfillmentPilotHandler} from './fulfillment-pilot-handler.mjs';
import {createOrderOperationsHandler} from './order-operations-handler.mjs';
import {createCheckoutSetupHandler} from './checkout-setup-handler.mjs';
import {checkoutRecoveryPage} from './checkout-recovery-page.mjs';
import {requireAdmin,requireOrigin,verify,body,send} from './security.mjs';
import {HttpError} from './model.mjs';
import {limit} from './storage.mjs';
import {createCartCheckoutService} from './cart-checkout-service.mjs';
import {cartCheckoutPage,cartCheckoutReturnPage} from './cart-checkout-page.mjs';
const idOK=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
function owner(req){const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-tp_shop_preview='))?.slice('__Host-tp_shop_preview='.length),token=verify(raw,'shop-preview',86400000);if(!token||!idOK(token.id))throw new HttpError(409,'The original cart session is unavailable. Return to the cart in the browser used for this review; do not pay again.');return token.id;}
export function createCartCheckoutHandler({env=process.env,service=createCartCheckoutService({env}),rate=limit,setup=createCheckoutSetupHandler({env,rate,configuration:()=>service.configuration()}),operations=createOrderOperationsHandler({env,rate,checkout:service}),pilot=createFulfillmentPilotHandler({env,rate})}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
 if(view?.startsWith('cart-checkout-pilot-'))return pilot(req,res);
 if(view?.startsWith('cart-checkout-ops-')||view?.startsWith('cart-checkout-buyer-'))return operations(req,res);
 if(view?.startsWith('cart-checkout-setup'))return setup(req,res);
 try{
  if(env.VERCEL_ENV!=='preview')throw new HttpError(503,'Integrated test checkout is restricted to private preview.');
  for(const k of q.keys())if(q.getAll(k).length!==1)throw new HttpError(400,'Duplicate checkout fields.');
  if(view==='cart-checkout-return'){
   if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Use GET.');
   if(!idOK(q.get('order'))||[...q.keys()].some(k=>!['view','order','canceled'].includes(k))||(q.has('canceled')&&q.get('canceled')!=='1'))throw new HttpError(400,'Invalid checkout return.');
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':cartCheckoutReturnPage());
  }
  requireAdmin(req);
  if(view==='cart-checkout-recovery-page'){
   if(!['GET','HEAD'].includes(req.method)||[...q.keys()].some(k=>k!=='view'))throw new HttpError(400,'Invalid recovery page request.');res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':checkoutRecoveryPage());
  }
  if(view==='cart-checkout-page'){
   if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Use GET.');
   if([...q.keys()].some(k=>!['view','order','review'].includes(k))||(q.has('order')&&!idOK(q.get('order')))||(q.has('review')&&!idOK(q.get('review')))||(q.has('order')&&q.has('review')))throw new HttpError(400,'Invalid checkout reference.');
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':cartCheckoutPage());
  }
  if(req.method==='GET'){
   await rate(req,'cart-checkout-read',30);
   if(view==='cart-checkout-config'&&[...q.keys()].every(k=>k==='view'))return send(res,200,await service.configuration());
   if(view==='cart-checkout-admin-order'&&[...q.keys()].every(k=>['view','order'].includes(k))&&idOK(q.get('order')))return send(res,200,await service.administratorRead(q.get('order')));
   if(view==='cart-checkout-history'&&[...q.keys()].every(k=>['view','cursor'].includes(k)))return send(res,200,await service.history(owner(req),q.get('cursor')));
   if(view==='cart-checkout-order'&&[...q.keys()].every(k=>['view','order'].includes(k))&&idOK(q.get('order')))return send(res,200,await service.read(owner(req),q.get('order')));
   throw new HttpError(400,'Invalid checkout query.');
  }
  if(req.method!=='POST'||view!=='cart-checkout-action'||[...q.keys()].some(k=>k!=='view'))throw new HttpError(405,'Unsupported checkout action.');
  requireOrigin(req);await rate(req,'cart-checkout-write',10);const input=await body(req,2200),{action,...data}=input;
  if(action==='admin-reconcile-order')return send(res,200,await service.administratorReconcile(data));
  const who=owner(req);
  if(action==='finalize-order')return send(res,200,await service.finalize(who,data));
  if(action==='open-checkout')return send(res,200,await service.open(who,data));
  if(action==='close-checkout')return send(res,200,await service.closeCheckout(who,data));
  if(action==='reconcile-order')return send(res,200,await service.reconcile(who,data));
  throw new HttpError(400,'Unknown checkout action.');
 }catch(e){if(e.status===401&&view==='cart-checkout-recovery-page'){res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/admin/checkout-recovery'));return res.end();}if(e.status===401&&view==='cart-checkout-page'){const id=idOK(q.get('order'))?'order='+q.get('order'):idOK(q.get('review'))?'review='+q.get('review'):'';res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/shop-preview/checkout'+(id?'?'+id:'')));return res.end();}return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'Checkout could not be verified. Retry this same order; no supplier purchase was submitted.'});}
};}
