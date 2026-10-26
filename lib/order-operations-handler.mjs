import {requireAdmin,requireOrigin,body,send} from './security.mjs';
import {limit} from './storage.mjs';
import {HttpError} from './model.mjs';
import {fields,orderId} from './order-extension-store.mjs';
import {createCartCheckoutService} from './cart-checkout-service.mjs';
import {createSupplierHandoff} from './supplier-handoff.mjs';
import {createBuyerOrderAccess} from './buyer-order-access.mjs';
import {orderOperationsPage,buyerOrderPage} from './order-operations-page.mjs';
export const BUYER_COOKIE='__Host-tp_buyer_order';
function cookie(req){const values=String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(BUYER_COOKIE+'='));if(values.length!==1)throw new HttpError(401,'Order access is invalid or expired.');return values[0].slice(BUYER_COOKIE.length+1);}
const setCookie=(res,token)=>res.setHeader('Set-Cookie',BUYER_COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+(token?'3600':'0'));
export function createOrderOperationsHandler({env=process.env,checkout=createCartCheckoutService({env}),supplier=createSupplierHandoff({env,checkout}),buyer=createBuyerOrderAccess({env,checkout,fulfillment:id=>supplier.buyerView(id)}),rate=limit}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view');res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{
  if(env.VERCEL_ENV!=='preview')throw new HttpError(503,'Order access and supplier handoffs are private-preview features.');
  for(const key of q.keys())if(q.getAll(key).length!==1||!['view','id'].includes(key))throw new HttpError(400,'Invalid order operations query.');
  const publicView=view?.startsWith('cart-checkout-buyer-');
  if(publicView){
   if(q.has('id'))throw new HttpError(400,'Order access is determined by its private session, not a query identifier.');
   if(!buyer.configuration().enabled)throw new HttpError(503,'Buyer order preview has not been activated.');
   if(view==='cart-checkout-buyer-page'&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':buyerOrderPage());}
   if(view==='cart-checkout-buyer-state'&&req.method==='GET'){await rate(req,'buyer-order-read',30);return send(res,200,await buyer.read(cookie(req)));}
   if(view==='cart-checkout-buyer-action'&&req.method==='POST'){
    requireOrigin(req);await rate(req,'buyer-order-write',10);const input=await body(req,800);
    if(input.action==='redeem'){fields(input,['action','token']);const result=await buyer.redeem(input.token);setCookie(res,result.sessionToken);return send(res,200,{accessGranted:true,expiresAt:result.expiresAt,readOnly:true});}
    if(input.action==='logout'){fields(input,['action']);const result=await buyer.logout(cookie(req));setCookie(res,'');return send(res,200,result);}
   }
   throw new HttpError(405,'This order portal supports read-only access, redemption and logout.');
  }
  requireAdmin(req);
  if(view==='cart-checkout-ops-page'&&['GET','HEAD'].includes(req.method)&&!q.has('id')){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':orderOperationsPage());}
  if(view==='cart-checkout-ops-status'&&req.method==='GET'){await rate(req,'order-ops-read',20);const id=orderId(q.get('id'));return send(res,200,{order:await checkout.administratorRead(id),access:await buyer.administration(id),supplier:await supplier.read(id),supplierConfig:supplier.configuration()});}
  if(view==='cart-checkout-ops-action'&&req.method==='POST'&&!q.has('id')){
   requireOrigin(req);await rate(req,'order-ops-write',10);const input=await body(req,2000),{action,...data}=input;
   if(action==='issue-access')return send(res,200,await buyer.issue(data));
   if(action==='revoke-access')return send(res,200,await buyer.revoke(data));
   if(action==='prepare-handoff')return send(res,200,await supplier.prepare(data));
   if(action==='reconcile-handoff')return send(res,200,await supplier.reconcile(data));
  }
  throw new HttpError(405,'Unsupported order operations action.');
 }catch(e){if(e.status===401&&view==='cart-checkout-ops-page'){res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/admin/order-operations'));return res.end();}return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'The operation could not be verified. No payment, email or supplier order was created.'});}
};}
