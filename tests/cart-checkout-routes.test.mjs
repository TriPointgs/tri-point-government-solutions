import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import fs from 'node:fs';
import {createCartCheckoutHandler} from '../lib/cart-checkout-handler.mjs';import {createShopHandler} from '../api/shop.js';import {sign} from '../lib/security.mjs';
process.env.NODE_ENV='test';process.env.TP_SESSION_SECRET='synthetic-cart-route-secret-no-real-value';
const admin=()=>sign({type:'admin',at:Date.now()}),owner=randomUUID(),order=randomUUID(),review=randomUUID();
const cart=()=>sign({type:'shop-preview',at:Date.now(),id:owner});
async function request({method='GET',view='cart-checkout-config',query='',token=admin(),cartToken=cart(),origin='http://localhost:3000',input,env={VERCEL_ENV:'preview'},shop=false}={}){
 let output='',calls=[];const service={configuration:async()=>{calls.push('config');return {ready:false,mode:'test'};},read:async(who,id)=>{calls.push(['read',who,id]);return {id,mode:'test'};},finalize:async(who,v)=>{calls.push(['finalize',who,v]);return {mode:'test'};},open:async(who,v)=>{calls.push(['open',who,v]);return {mode:'test'};},reconcile:async(who,v)=>{calls.push(['reconcile',who,v]);return {mode:'test'};},history:async(who,v)=>{calls.push(['history',who,v]);return {mode:'test',records:[],hasMore:false,cursor:null,realSupplierDispatchAllowed:false};}},rate=async()=>{},handler=shop?createShopHandler({env,service:{},rate}):createCartCheckoutHandler({env,service,rate});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s=''){output=s;}};
 await handler({method,url:'/api/shop?view='+view+query,headers:{origin,'content-type':'application/json',cookie:[token?'__Host-tp_admin='+token:'',cartToken?'__Host-tp_shop_preview='+cartToken:''].filter(Boolean).join('; ')},body:input},res);return {status:res.statusCode,headers:res.headers,output,calls};
}
test('private history accepts only signed original owner and ignores externally supplied owner values',async()=>{
 const good=await request({view:'cart-checkout-history'});assert.equal(good.status,200);assert.deepEqual(good.calls,[['history',owner,null]]);
 const next=await request({view:'cart-checkout-history',query:'&cursor=opaque-cursor'});assert.equal(next.status,200);assert.deepEqual(next.calls,[['history',owner,'opaque-cursor']]);
 for(const opts of [{token:''},{cartToken:''},{query:'&owner='+randomUUID()},{query:'&view=cart-checkout-history'},{method:'POST'}]){const bad=await request({view:'cart-checkout-history',...opts});assert.ok(bad.status>=400);assert.equal(bad.calls.length,0);}
});
test('new checkout page is wired through the existing shop handler and requires administrator access',async()=>{
 const r=await request({view:'cart-checkout-page',shop:true});assert.equal(r.status,200);assert.match(r.output,/cc-finalize/);assert.match(r.output,/NO LIVE PURCHASE/);
 for(const token of ['',sign({type:'contractor',at:Date.now()})]){const bad=await request({view:'cart-checkout-page',token,shop:true});assert.equal(bad.status,303);assert.match(bad.headers.Location,/login/);}
});
test('all integrated checkout endpoints deny production including the data-free return hop',async()=>{
 for(const view of ['cart-checkout-page','cart-checkout-config','cart-checkout-order','cart-checkout-action','cart-checkout-return']){const r=await request({view,env:{VERCEL_ENV:'production'},query:'&order='+order});assert.equal(r.status,503);assert.equal(r.calls.length,0);}
});
test('order status reads use the original signed cart owner and never issue a replacement cookie',async()=>{
 const r=await request({view:'cart-checkout-order',query:'&order='+order});assert.equal(r.status,200);assert.deepEqual(r.calls,[['read',owner,order]]);assert.equal(r.headers['Set-Cookie'],undefined);assert.match(r.headers['Cache-Control'],/no-store/);
 const missing=await request({view:'cart-checkout-order',query:'&order='+order,cartToken:''});assert.equal(missing.status,409);assert.equal(missing.calls.length,0);assert.equal(missing.headers['Set-Cookie'],undefined);
});
test('all checkout writes enforce admin, CSRF and the existing cart session before invoking business code',async()=>{
 for(const patch of [{token:''},{token:sign({type:'contractor',at:Date.now()})},{origin:'https://evil.test'},{cartToken:''}]){const r=await request({method:'POST',view:'cart-checkout-action',input:{action:'open-checkout',orderId:order,testConsent:true},...patch});assert.ok(r.status>=400);assert.equal(r.calls.length,0);}
 const good=await request({method:'POST',view:'cart-checkout-action',input:{action:'open-checkout',orderId:order,testConsent:true}});assert.equal(good.status,200);assert.deepEqual(good.calls,[['open',owner,{orderId:order,testConsent:true}]]);
});
test('query duplicates, malformed references, extra fields and unsupported methods are rejected',async()=>{
 for(const options of [{view:'cart-checkout-page',query:'&review='+review+'&order='+order},{view:'cart-checkout-page',query:'&review=bad'},{view:'cart-checkout-config',query:'&view=cart-checkout-config'},{view:'cart-checkout-order',query:'&order='+order+'&paid=true'},{view:'cart-checkout-action',method:'POST',query:'&paid=true',input:{action:'reconcile-order',orderId:order}},{view:'cart-checkout-page',method:'POST'}]){const r=await request(options);assert.ok(r.status>=400);assert.equal(r.calls.length,0);}
});
test('external Stripe return is public data-free and preserves Strict admin/cart cookies',async()=>{
 const r=await request({view:'cart-checkout-return',query:'&order='+order,token:'',cartToken:''});assert.equal(r.status,200);assert.equal(r.calls.length,0);assert.equal(r.headers['Set-Cookie'],undefined);assert.match(r.output,/does not confirm payment/);assert.match(r.output,/cart-checkout-return.js/);assert.doesNotMatch(r.output,/pi_|cs_test_|sk_test_|whsec_/);
 for(const query of ['', '&order=bad','&order='+order+'&order='+randomUUID(),'&order='+order+'&url=https://evil.test','&order='+order+'&canceled=2'])assert.equal((await request({view:'cart-checkout-return',query,token:''})).status,400);
 assert.match(fs.readFileSync('lib/security.mjs','utf8'),/SameSite=Strict/);assert.match(fs.readFileSync('api/shop.js','utf8'),/SameSite=Strict/);
});
test('auth redirect preserves a validated order or review reference only',async()=>{
 const r=await request({view:'cart-checkout-page',query:'&order='+order,token:''});assert.equal(r.headers.Location,'/login?next='+encodeURIComponent('/shop-preview/checkout?order='+order));
});
test('new routes and saved-review continuation link exist without a new serverless function',()=>{
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.ok(config.rewrites.some(r=>r.source==='/shop-preview/checkout'&&r.destination==='/api/shop?view=cart-checkout-page'));assert.ok(config.rewrites.some(r=>r.source==='/shop-preview/checkout-return'));
 assert.match(fs.readFileSync('lib/checkout-review-page.mjs','utf8'),/checkout-payment-link/);assert.match(fs.readFileSync('assets/checkout-review.js','utf8'),/checkout\?review=/);
});
