import {requireAdmin,requireOrigin,body,send} from './security.mjs';
import {HttpError} from './model.mjs';import {limit} from './storage.mjs';
import {fields,orderId,finalized} from './order-extension-store.mjs';
import {createFinalOrderStore} from './final-order-store.mjs';
import {createCartCheckoutService} from './cart-checkout-service.mjs';
import {createOrderReleaseControl} from './order-release-control.mjs';
import {createOrderRefund} from './order-refund.mjs';
import {createOrderTaxLedger} from './order-tax-ledger.mjs';
import {orderExceptionsPage} from './order-exceptions-page.mjs';
export function createOrderExceptionsHandler({env=process.env,orders=createFinalOrderStore({env}),checkout=createCartCheckoutService({env}),release=createOrderReleaseControl({env,orders}),refund=createOrderRefund({env,orders,release}),taxLedger=createOrderTaxLedger({env,orders,refundReader:id=>refund.verifiedFullRefund(id)}),rate=limit}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view');res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{if(env.VERCEL_ENV!=='preview')throw new HttpError(503,'Order exceptions are private test tools only.');requireAdmin(req);for(const k of q.keys())if(!['view','id'].includes(k)||q.getAll(k).length!==1)throw new HttpError(400,'Invalid exception query.');
  if(view==='cart-checkout-exception-page'&&!q.has('id')&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':orderExceptionsPage());}
  if(view==='cart-checkout-exception-status'&&req.method==='GET'){await rate(req,'order-exceptions-read',20);const id=orderId(q.get('id')),d=await checkout.administratorRead(id),taxConfiguration=taxLedger.configuration(),taxEnabled=taxConfiguration.enabled===true,taxReadable=taxEnabled||taxConfiguration.readable===true;return send(res,200,{mode:'test',order:{id:d.id,reference:d.reference,totalCents:d.totalCents,checkoutState:d.checkoutState,captureConfirmed:d.captureConfirmed},release:await release.read(id),refund:await refund.read(id),taxLedger:{enabled:taxEnabled,...(taxReadable?await taxLedger.read(id):{mode:'test',orderId:id,state:'disabled',saleTransactionId:null,reversalTransactionId:null})},closeEnabled:(await checkout.configuration()).expiryEnabled===true,liveEnabled:false});}
  if(view==='cart-checkout-exception-action'&&!q.has('id')&&req.method==='POST'){requireOrigin(req);await rate(req,'order-exceptions-write',8);const {action,...input}=await body(req,1600);
   if(action==='stop')return send(res,200,await release.stop(input));
   if(action==='refund')return send(res,200,await refund.submit(input));
   if(action==='reconcile-refund')return send(res,200,await refund.reconcile(input));
   if(['tax-sale','tax-reversal','reconcile-tax-sale','reconcile-tax-reversal'].includes(action)){
    const reconcile=action.startsWith('reconcile-');fields(input,reconcile?['orderId','consent','transactionId']:['orderId','consent']);orderId(input.orderId);
    if(input.consent!==true)throw new HttpError(400,'Confirm this exact TEST tax ledger action.');
    if(action==='tax-sale')return send(res,200,await taxLedger.postSale(input.orderId));
    if(action==='tax-reversal')return send(res,200,await taxLedger.reverseFull(input.orderId));
    if(action==='reconcile-tax-sale')return send(res,200,await taxLedger.reconcileSale(input.orderId,input.transactionId));
    return send(res,200,await taxLedger.reconcileReversal(input.orderId,input.transactionId));
   }
   if(action==='close-unpaid'){fields(input,['orderId','consent']);if(input.consent!==true)throw new HttpError(400,'Confirm closing only the existing unpaid test Session.');const r=await finalized(orders,orderId(input.orderId)),s=await release.read(r.id);if(!s.releaseStopped)throw new HttpError(409,'Stop release before closing the existing Session.');const result=await checkout.closeCheckout(r.owner,{orderId:r.id,closeConsent:true});return send(res,200,{mode:'test',checkoutClosed:result.checkoutClosed,checkoutState:result.checkoutState,captureConfirmed:result.captureConfirmed,refundRequested:false});}
  }throw new HttpError(405,'Unsupported order-exception action.');
 }catch(e){if(e.status===401&&view==='cart-checkout-exception-page'){res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/admin/order-exceptions'));return res.end();}return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'The operation is unverified. Reload this same order; do not submit a replacement transaction.'});}
};}
