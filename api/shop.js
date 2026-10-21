import {createImageRequestBudget} from '../lib/product-image-budget.mjs';
import {productHtml,categoryHtml,productContentSecurity} from '../lib/storefront-seo-page.mjs';
import {launchPage} from '../lib/launch-readiness.mjs';
import {sampleOrderEmail} from '../lib/order-email-templates.mjs';
import {productRoute,SHOP_CATEGORIES} from '../assets/shop-routes.mjs';
import {randomUUID} from 'node:crypto';
import {requireAdmin,requireOrigin,body,send,fail,sign,verify} from '../lib/security.mjs';
import {HttpError} from '../lib/model.mjs';import {limit} from '../lib/storage.mjs';
import {createShopService} from '../lib/shop-cart-service.mjs';import {shopPreviewPage} from '../lib/shop-preview-page.mjs';
const COOKIE='__Host-tp_shop_preview';
function cartSession(req,res){const value=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);const p=verify(value,'shop-preview',86400000);if(p&&typeof p.id==='string'&&/^[0-9a-f-]{36}$/.test(p.id))return p.id;const id=randomUUID();res.setHeader('Set-Cookie',COOKIE+'='+sign({type:'shop-preview',id,at:Date.now()})+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400');return id;}
export function createShopHandler({env=process.env,service=createShopService({env}),rate=limit,imageRate=rate===limit?createImageRequestBudget({env}):async(req,action)=>rate(req,'image-'+action,action==='provider'?60:240)}={}){return async(req,res)=>{
 const url=new URL(req.url,'https://tripointgs.com'),view=url.searchParams.get('view')||'cart';res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{requireAdmin(req);if(env.VERCEL_ENV==='production')throw new HttpError(503,'Shopping has not been released to the public website.');
 for(const key of url.searchParams.keys())if(url.searchParams.getAll(key).length!==1)throw new HttpError(400,'Duplicate fields.');
 if(req.method==='GET'||req.method==='HEAD'){
  if(view==='launch-page'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':launchPage());}
  if(view==='product-page'){
   if(!/^[1-9]\d{0,11}$/.test(url.searchParams.get('sku')||''))throw new HttpError(400,'Invalid product page.');await rate(req,'shop-product-page',40);const document=await service.productDocument(url.searchParams.get('sku')),rendered=productHtml(document,env),path=productRoute(document.product);
   const slug=url.searchParams.get('slug');if(slug&&slug!==path.split('/').at(-1)){res.statusCode=308;res.setHeader('Location',path);return res.end();}
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',productContentSecurity(rendered.hash));return res.end(req.method==='HEAD'?'':rendered.html);
  }
  if(view==='category-page'){const category=url.searchParams.get('category');if(!Object.hasOwn(SHOP_CATEGORIES,category||''))throw new HttpError(404,'Category not found.');await rate(req,'shop-category-page',30);const data=await service.browse({category}),rendered=categoryHtml(category,data,env);res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':rendered.html);}
  if(view==='page'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':shopPreviewPage());}
  if(req.method!=='GET')throw new HttpError(405,'Use GET.');
  if(view==='content-status'){await rate(req,'shop-content-status',30);return send(res,200,service.contentStatus());}
  if(view==='content'){await imageRate(req,'read');if(!/^[1-9]\d{0,11}$/.test(url.searchParams.get('sku')||''))throw new HttpError(400,'Invalid SKU.');const media=url.searchParams.get('media')||'cover';if(!['cover','gallery'].includes(media))throw new HttpError(400,'Invalid media selection.');const cached=service.contentCached?await service.contentCached(url.searchParams.get('sku'),media):null;if(cached)return send(res,200,cached);await imageRate(req,'provider');return send(res,200,await service.contentLookup(url.searchParams.get('sku'),media));}
  if(view==='product-offer'){
   if([...url.searchParams.keys()].some(k=>!['view','sku','quantity','zip'].includes(k)))throw new HttpError(400,'Invalid product-offer fields.');
   const count=url.searchParams.get('quantity')||'1';if(!/^[1-9]\d{0,3}$/.test(count))throw new HttpError(400,'Invalid product quantity.');
   await rate(req,'shop-product-offer',20);return send(res,200,await service.productOffer({sku:url.searchParams.get('sku'),quantity:Number(count),zip:url.searchParams.get('zip')||''}));
  }
  if(view==='products'){await rate(req,'shop-search',40);const input=Object.fromEntries(url.searchParams);delete input.view;return send(res,200,await service.browse(input));}
  if(view==='launch-status'){await rate(req,'launch-status',30);return send(res,200,await service.launchStatus());}
  if(view==='email-preview'){const kind=url.searchParams.get('kind')||'received';if(!['received','authorized','shipment','held'].includes(kind))throw new HttpError(400,'Unknown email preview.');const template=sampleOrderEmail(kind);res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");return res.end(template.html);}
  const id=cartSession(req,res);if(view==='checkout-review')return send(res,200,await service.readCheckout(id,url.searchParams.get('id')));if(view==='cart')return send(res,200,await service.read(id));
  if(view==='merchant-diagnostics')return send(res,200,await service.diagnostics(id));
  throw new HttpError(404,'Unknown shopping view.');
 }
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');requireOrigin(req);await rate(req,'shop-cart-change',30);const input=await body(req,10000);const id=cartSession(req,res);if(input.action==='prepare-checkout'){const {action,...data}=input;return send(res,200,await service.prepareCheckout(id,data));}if(input.action==='discard-checkout'){if(Object.keys(input).some(k=>!['action','id'].includes(k)))throw new HttpError(400,'Invalid discard fields.');return send(res,200,await service.discardCheckout(id,input.id));}return send(res,200,await service.change(id,input));
 }catch(e){if(view==='content'&&req.method==='GET'&&[429,502,503].includes(e.status)){const code=['image_request_budget','image_service_unavailable','image_service_busy','icecat_access_denied','icecat_rate_limited'].includes(e.code)?e.code:'image_temporarily_unavailable';const retryAfter=e.status===429?Math.max(1,Math.min(900,Number(e.retryAfter)||60)):null;if(retryAfter)res.setHeader('Retry-After',String(retryAfter));return send(res,e.status,{error:e instanceof HttpError?e.message:'Photo service is temporarily unavailable.',code,...(retryAfter?{retryAfter}:{})});}if(['page','product-page','category-page','launch-page'].includes(view)&&e.status===401){const next=view==='launch-page'?'/admin/launch':view==='product-page'&&/^[1-9]\d{0,11}$/.test(url.searchParams.get('sku')||'')?'/shop-preview/product/'+url.searchParams.get('sku'):'/shop-preview';res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent(next));return res.end();}return fail(res,e);}
 };}
export default createShopHandler();
