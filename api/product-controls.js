import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {HttpError} from '../lib/model.mjs';
import {limit} from '../lib/storage.mjs';
import {createProductControls} from '../lib/product-controls-service.mjs';
import {productControlsPage} from '../lib/product-controls-page.mjs';
export function createProductControlsHandler({env=process.env,service=createProductControls({env}),rate=limit}={}) {
  return async(req,res)=>{
    const params=new URL(req.url,'https://tripointgs.com').searchParams,view=params.get('view')||'selection';
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
    try{
      requireAdmin(req);
      // Review branch only. Do not accidentally enable production writes by merging styling.
      if(env.VERCEL_ENV==='production')throw new HttpError(503,'The Product Control Center has not been released to production.');
      for(const key of params.keys())if(params.getAll(key).length>1)throw new HttpError(400,'Duplicate query fields.');
      if(req.method==='GET'||req.method==='HEAD'){
        if(view==='page'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':productControlsPage());}
        if(req.method==='HEAD')throw new HttpError(405,'Use GET for workspace data.');
        if(view==='market'){await rate(req,'retail-market-read',60);return send(res,200,await service.marketRead(params.get('id'),params.get('zip')||''));}
        if(view==='shopping-status')return send(res,200,service.shoppingStatus());
        if(view==='configuration')return send(res,200,service.configuration());
        if(view==='selection'){const filters=Object.fromEntries(params);delete filters.view;return send(res,200,await service.list(filters));}
        if(view==='source'){await rate(req,'product-source-read',30);const query=Object.fromEntries(params);delete query.view;return send(res,200,await service.source(query));}
        if(view==='customer-preview')return send(res,200,await service.customerPreview(params.get('id')));
        throw new HttpError(404,'Unknown product view.');
      }
      if(req.method!=='POST'){res.setHeader('Allow','GET, HEAD, POST');throw new HttpError(405,'Method not allowed.');}
      requireOrigin(req);const input=await body(req,32000);
      const fields={import:['query','selections','revision'],rules:['policy','pricingPolicy','revision'],review:['id','patch','revision'],refresh:['productIds','revision'],marketSave:['id','revision','offer','destinationZip'],marketRemove:['id','revision','retailer','destinationZip'],marketSearch:['id']};
      if(!Object.hasOwn(fields,input.action)||Object.keys(input).some(k=>k!=='action'&&!fields[input.action].includes(k)))throw new HttpError(400,'Unsupported product action.');
      if(input.action==='marketSearch')await rate(req,'serpapi-google-shopping',3);
      if(input.action==='marketSave'||input.action==='marketRemove')await rate(req,'retail-market-write',30);
      if(input.action==='refresh')await rate(req,'td-product-check',10);
      if(input.action==='import')await rate(req,'td-product-import',15);
      return send(res,200,await service[input.action](input));
    }catch(e){if(view==='page'&&e.status===401){res.statusCode=303;res.setHeader('Location','/login');return res.end();}return fail(res,e);}
  };
}
export default createProductControlsHandler();
