import {requireAdmin,requireOrigin,body,send} from './security.mjs';
import {limit} from './storage.mjs';import {HttpError} from './model.mjs';
import {fields,orderId} from './order-extension-store.mjs';
import {createBuyerPayment} from './buyer-payment.mjs';
import {buyerPaymentPage,buyerPaymentAdminPage} from './buyer-payment-pages.mjs';
export const BUYER_PAYMENT_COOKIE='__Host-tp_buyer_payment';
function token(req){const c=String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(BUYER_PAYMENT_COOKIE+'='));if(c.length!==1)throw new HttpError(401,'Payment invitation is invalid or expired.');return c[0].slice(BUYER_PAYMENT_COOKIE.length+1);}
const set=(res,value)=>res.setHeader('Set-Cookie',BUYER_PAYMENT_COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+(value?'3600':'0'));
export function createBuyerPaymentHandler({env=process.env,service=createBuyerPayment({env}),rate=limit}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view');res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{if(env.VERCEL_ENV!=='preview')throw new HttpError(503,'Buyer payment pilot is private preview only.');for(const k of q.keys())if(q.getAll(k).length!==1||!['view','id','order'].includes(k))throw new HttpError(400,'Invalid buyer payment query.');
  if(view?.startsWith('cart-checkout-pay-admin-')){requireAdmin(req);if(q.has('order'))throw new HttpError(400,'Invalid administration query.');
   if(view==='cart-checkout-pay-admin-page'&&!q.has('id')&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':buyerPaymentAdminPage());}
   if(view==='cart-checkout-pay-admin-state'&&req.method==='GET'){await rate(req,'buyer-pay-admin-read',20);return send(res,200,await service.administration(orderId(q.get('id'))));}
   if(view==='cart-checkout-pay-admin-action'&&!q.has('id')&&req.method==='POST'){requireOrigin(req);await rate(req,'buyer-pay-admin-write',10);const {action,...input}=await body(req,1200);if(action==='issue')return send(res,200,await service.issue(input));if(action==='revoke')return send(res,200,await service.revoke(input));}
   throw new HttpError(405,'Unsupported payment-administration action.');
  }
  if(q.has('id')||(q.has('order')&&view!=='cart-checkout-pay-return'))throw new HttpError(400,'Payment access comes from its private session, not a supplied order identifier.');
  if(!service.configuration().enabled)throw new HttpError(503,'Buyer test checkout has not been activated.');
  if(view==='cart-checkout-pay-page'&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':buyerPaymentPage());}
  if(req.method==='GET'){await rate(req,'buyer-pay-read',30);if(view==='cart-checkout-pay-return')return send(res,200,await service.returnRoute(token(req),orderId(q.get('order'))));if(view==='cart-checkout-pay-state')return send(res,200,{...await service.read(token(req)),acceptedRequest:await service.acceptedRequest(token(req))});}
  if(view==='cart-checkout-pay-action'&&req.method==='POST'){requireOrigin(req);await rate(req,'buyer-pay-write',10);const {action,...input}=await body(req,1800);
   if(action==='redeem'){fields(input,['token']);const d=await service.redeem(input.token);set(res,d.sessionToken);return send(res,200,{accessGranted:true,expiresAt:d.expiresAt});}
   if(action==='open')return send(res,200,await service.open(token(req),input));
   if(action==='reconcile')return send(res,200,await service.reconcile(token(req),input));
   if(action==='logout'){fields(input,[]);const d=await service.logout(token(req));set(res,'');return send(res,200,d);}
  }
  throw new HttpError(405,'Unsupported buyer test-checkout action.');
 }catch(e){if(e.status===401&&view==='cart-checkout-pay-admin-page'){res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/admin/buyer-checkout'));return res.end();}return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'The test checkout could not be verified. Recover this same order; do not create a replacement payment.'});}
};}
