import {randomUUID} from 'node:crypto';
import {requireAdmin,requireOrigin,body,send,fail,sign,verify} from '../lib/security.mjs';
import {HttpError} from '../lib/model.mjs';import {limit} from '../lib/storage.mjs';
import {createShopService} from '../lib/shop-cart-service.mjs';import {shopPreviewPage} from '../lib/shop-preview-page.mjs';
const COOKIE='__Host-tp_shop_preview';
function cartSession(req,res){const value=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);const p=verify(value,'shop-preview',86400000);if(p&&typeof p.id==='string'&&/^[0-9a-f-]{36}$/.test(p.id))return p.id;const id=randomUUID();res.setHeader('Set-Cookie',COOKIE+'='+sign({type:'shop-preview',id,at:Date.now()})+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400');return id;}
export function createShopHandler({env=process.env,service=createShopService({env}),rate=limit}={}){return async(req,res)=>{
 const url=new URL(req.url,'https://tripointgs.com'),view=url.searchParams.get('view')||'cart';res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{requireAdmin(req);if(env.VERCEL_ENV==='production')throw new HttpError(503,'Shopping has not been released to the public website.');
 for(const key of url.searchParams.keys())if(url.searchParams.getAll(key).length!==1)throw new HttpError(400,'Duplicate fields.');
 if(req.method==='GET'||req.method==='HEAD'){
  if(view==='page'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':shopPreviewPage());}
  if(req.method!=='GET')throw new HttpError(405,'Use GET.');
  if(view==='content-status'){await rate(req,'shop-content-status',30);return send(res,200,service.contentStatus());}
  if(view==='content'){await rate(req,'icecat-content-lookup',5);if(!/^[1-9]\d{0,11}$/.test(url.searchParams.get('sku')||''))throw new HttpError(400,'Invalid SKU.');return send(res,200,await service.contentLookup(url.searchParams.get('sku')));}
  if(view==='products'){await rate(req,'shop-search',40);const input=Object.fromEntries(url.searchParams);delete input.view;return send(res,200,await service.browse(input));}
  const id=cartSession(req,res);if(view==='cart')return send(res,200,await service.read(id));
  if(view==='merchant-diagnostics')return send(res,200,await service.diagnostics(id));
  throw new HttpError(404,'Unknown shopping view.');
 }
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');requireOrigin(req);await rate(req,'shop-cart-change',30);const input=await body(req,6000);const id=cartSession(req,res);return send(res,200,await service.change(id,input));
 }catch(e){if(view==='page'&&e.status===401){res.statusCode=303;res.setHeader('Location','/login?next=%2Fshop-preview');return res.end();}return fail(res,e);}
 };}
export default createShopHandler();
