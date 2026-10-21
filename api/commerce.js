import {createOrderTrackingHandler} from '../lib/order-tracking-handler.mjs';
import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {HttpError} from '../lib/model.mjs';
import {OrderError} from '../lib/commerce-order.mjs';
import {createOrderLabService} from '../lib/commerce-service.mjs';
import {createPreviewOrderRepository} from '../lib/commerce-store.mjs';
import {orderLabPage} from '../lib/order-lab-page.mjs';
export function createCommerceHandler({env=process.env,service=createOrderLabService({repository:createPreviewOrderRepository(env)}),trackingHandler=createOrderTrackingHandler({env})}={}){
 return async(req,res)=>{
  const params=new URL(req.url,'https://tripointgs.com').searchParams,page=params.get('view')==='page';
  if(params.get('mode')==='tracking')return trackingHandler(req,res);
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  try{
   requireAdmin(req);
   if(!['GET','HEAD','POST'].includes(req.method)){res.setHeader('Allow','GET, HEAD, POST');throw new HttpError(405,'Method not allowed.');}
   // No production code path can create, advance, dispatch, or send a commerce order.
   if(env.VERCEL_ENV==='production')throw new HttpError(503,'Automated ordering has not been released.');
   if(page){if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Method not allowed.');res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=200;return res.end(req.method==='HEAD'?'':orderLabPage({admin:true}));}
   if(req.method==='GET')return send(res,200,params.get('id')?(await service.read(params.get('id'))).order:await service.list(params.get('cursor')||undefined));
   if(req.method==='HEAD')throw new HttpError(405,'Use GET for simulation records.');
   requireOrigin(req);const data=await body(req,6000);
   if(data.mode!=='simulation')throw new HttpError(400,'Explicit simulation mode required.');
   if(data.action==='create'){if(Object.keys(data).some(k=>!['action','mode','id','scenario'].includes(k)))throw new HttpError(400,'Only fixed synthetic fixtures are accepted.');const r=await service.create(data);return send(res,r.created?201:200,r);}
   if(Object.keys(data).some(k=>!['action','mode','id','eventId','step','expectedRevision'].includes(k))||data.action!=='advance')throw new HttpError(400,'Unsupported request.');
   return send(res,200,await service.action({...data,action:data.step}));
  }catch(e){if(page&&e.status===401){res.statusCode=303;res.setHeader('Location','/login');return res.end();}return fail(res,e instanceof OrderError?new HttpError(e.status,e.message):e);}
 };
}
export default createCommerceHandler();
