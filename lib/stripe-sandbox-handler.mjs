import {randomUUID} from 'node:crypto';
import {requireAdmin,requireOrigin,body,send,fail,sign,verify} from './security.mjs';
import {HttpError} from './model.mjs';
import {limit} from './storage.mjs';
import {createStripeSandboxCheckout} from './stripe-sandbox-checkout.mjs';
import {stripeSandboxPage} from './stripe-sandbox-page.mjs';
const COOKIE='__Host-tp_stripe_demo';
const idOk=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
function owner(req,res,initialize=false){const raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1),token=verify(raw,'stripe-demo',8*3600000);if(token&&idOk(token.id))return token.id;if(!initialize)throw new HttpError(401,'Open the sandbox test page in the same signed-in browser.');const id=randomUUID();res.setHeader('Set-Cookie',COOKIE+'='+sign({type:'stripe-demo',id,at:Date.now()})+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800');return id;}
export function createStripeSandboxHandler({env=process.env,service=createStripeSandboxCheckout({env}),rate=limit}={}){return async(req,res)=>{
 const url=new URL(req.url,'https://tripointgs.com'),view=url.searchParams.get('view')||'configuration';res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
 try{requireAdmin(req);if(env.VERCEL_ENV==='production')throw new HttpError(503,'Sandbox checkout is not available on production.');for(const k of url.searchParams.keys())if(url.searchParams.getAll(k).length!==1)throw new HttpError(400,'Duplicate sandbox fields.');
  if(view==='page'){if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Method not allowed.');owner(req,res,true);res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':stripeSandboxPage());}
  if(req.method==='GET'){await rate(req,'sandbox-checkout-read',40);if(view==='configuration'){owner(req,res,true);return send(res,200,service.configuration());}if(view==='status')return send(res,200,await service.status(owner(req,res),url.searchParams.get('id')));throw new HttpError(404,'Sandbox view not found.');}
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');requireOrigin(req);const input=await body(req,1400),who=owner(req,res);await rate(req,'sandbox-checkout-write',10);
  if(input.action==='start'){if(Object.keys(input).some(k=>!['action','id','consent'].includes(k)))throw new HttpError(400,'Only the fixed sandbox test is permitted.');return send(res,200,await service.start(who,input.id,input.consent));}
  if(input.action==='check'){if(Object.keys(input).some(k=>!['action','id'].includes(k)))throw new HttpError(400,'Unexpected test fields.');return send(res,200,await service.check(who,input.id));}throw new HttpError(400,'Unsupported sandbox action.');
 }catch(e){if(view==='page'&&e.status===401){const id=url.searchParams.get('run'),next='/admin/stripe-checkout'+(idOk(id)?'?run='+id:'');res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent(next));return res.end();}return fail(res,e instanceof HttpError?e:new HttpError(503,'Sandbox Checkout is temporarily unavailable. No supplier order was submitted.'));}
};}
