import test from 'node:test';import assert from 'node:assert/strict';
import {createIcecatContent,normalizeIcecatContent,selectIcecatImage,selectIcecatImages,ICECAT_MAX_GALLERY_IMAGES,readLimited} from '../lib/icecat-content.mjs';
import {createShopService} from '../lib/shop-cart-service.mjs';
import {memoryProductStore} from '../lib/product-controls-store.mjs';
import {createShopHandler} from '../api/shop.js';
import {sign} from '../lib/security.mjs';
const product={manufacturer:'LENOVO',mfgPart:'21KCS4S600'},env={VERCEL_ENV:'preview',TP_ICECAT_API_TOKEN:'synthetic-api-credential-never-real',TP_ICECAT_CONTENT_TOKEN:'synthetic-content-credential-never-real'};
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const body=(patch={})=>({msg:'OK',data:{GeneralInfo:{IcecatId:12345,Brand:'LENOVO',BrandPartCode:'21KCS4S600',Title:'Lenovo ThinkPad 21KCS4S600',Description:{LongDesc:'Ultralight <b>Lenovo</b> business laptop'},BulletPoints:{Values:['Efficient <strong>laptop</strong>']}},Image:{LowPic:'https://images.icecat.biz/img/gallery/picture.jpg?token=PRIVATE_CONTENT_KEY'},Gallery:[{Type:'ProductImage',LowPic:'https://images.icecat.biz/img/gallery/picture.jpg?token=PRIVATE_CONTENT_KEY',No:'1'}],FeaturesGroups:[{Features:[{Feature:{Name:{Value:'Memory'}},PresentationValue:'16 GB'}]}],...patch}});
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
const img=()=>new Response(png,{status:200,headers:{'content-type':'image/png'}});
const client=(fetcher,options={})=>createIcecatContent({env,fetcher,...options});
test('Icecat request uses exact brand + full manufacturer part in fixed HTTPS host and both tokens in headers',async()=>{const calls=[],c=client(async(url,opt)=>{calls.push({url,opt});return calls.length===1?json(body()):img();});const r=await c.lookup(product);assert.equal(calls.length,2);const u=new URL(calls[0].url);assert.equal(u.origin,'https://live.icecat.biz');assert.equal(u.pathname,'/api');assert.equal(u.searchParams.get('Brand'),'LENOVO');assert.equal(u.searchParams.get('ProductCode'),'21KCS4S600');assert.equal(u.searchParams.get('lang'),'EN');assert.equal(calls[0].opt.headers['api-token'],env.TP_ICECAT_API_TOKEN);assert.equal(calls[0].opt.headers['content-token'],env.TP_ICECAT_CONTENT_TOKEN);assert.equal(calls[0].opt.redirect,'error');assert.equal(r.status,'matched');assert.equal(r.identityVerified,true);assert.equal(r.publicationApproved,false);assert.ok(r.imageData.startsWith('data:image/png;base64,'));assert.doesNotMatch(JSON.stringify(r),/PRIVATE_CONTENT_KEY|synthetic-api-credential|synthetic-content-credential|images\.icecat\.biz/);});
test('returned product part suffix must match exactly',()=>{for(const part of ['21KCS4S60','21KCS4S600-ALT','LENOVO 21KCS4S600','21KCS4S600#AAA']){const r=normalizeIcecatContent(body({GeneralInfo:{...body().data.GeneralInfo,BrandPartCode:part}}),product);assert.equal(r.status,'identity-mismatch');assert.equal(r.product,null);}});
test('brand mismatch fails closed even if the full part code matches',()=>{const r=normalizeIcecatContent(body({GeneralInfo:{...body().data.GeneralInfo,Brand:'SUSPICIOUS'}}),product);assert.equal(r.status,'identity-mismatch');});
test('long descriptive HTML is presented only as stripped plain text',()=>{const p=normalizeIcecatContent(body(),product);assert.equal(p.product.description,'Ultralight Lenovo business laptop');assert.equal(p.product.bullets[0],'Efficient laptop');assert.equal(p.product.specs[0].name,'Memory');});
test('no image is distinct from no product match',()=>{const r=normalizeIcecatContent(body({Gallery:[],Image:{}}),product);assert.equal(r.status,'matched');assert.equal(r.product.hasImage,false);assert.equal(r.privateImageLink,null);});
test('image picker excludes logo and obvious packaging if real product photo available',()=>{const r=selectIcecatImage({Gallery:[{Type:'BrandLogo',LowPic:'https://images.icecat.biz/img/logo.jpg',No:'1'},{Type:'ProductImage',LowPic:'https://images.icecat.biz/img/product.jpg',No:'2'}],Image:{LowPic:'https://images.icecat.biz/img/fallback.jpg'}});assert.match(r,/product\.jpg/);});
test('SSRF and credential-bearing URLs from non-Icecat hosts are not fetched',async()=>{let called=0;for(const url of ['http://images.icecat.biz/evil','https://127.0.0.1/secret','https://images.icecat.biz.evil.test/x','https://user:pass@images.icecat.biz/x','https://images.icecat.biz:8766/secret','https://evil.example/']){const r=normalizeIcecatContent(body({Gallery:[{Type:'ProductImage',LowPic:url}]}),product);assert.equal(r.privateImageLink,null,url);}const c=client(async()=>{called++;return json(body({Gallery:[{Type:'ProductImage',LowPic:'https://evil.example/token=secret'}]}));});await c.lookup(product);assert.equal(called,1);});
test('restricted or unlicensed content gives a status without raw provider error details',()=>{const r=normalizeIcecatContent({msg:'Error',StatusCode:9,message:'provider token PRIVATE'},product);assert.equal(r.status,'account-or-brand-access-held');assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);});
test('missing account token and production mode fail before any network activity',async()=>{let calls=0;for(const e of [{VERCEL_ENV:'preview',TP_ICECAT_API_TOKEN:'x'},{...env,VERCEL_ENV:'production'}]){const c=createIcecatContent({env:e,fetcher:async()=>{calls++;}});await assert.rejects(c.lookup(product),x=>x.status===503);}assert.equal(calls,0);});
test('malformed brand/part inputs are refused before API activity',async()=>{let calls=0;const c=client(async()=>{calls++;});for(const p of [{manufacturer:'LENOVO',mfgPart:'<script>'},{manufacturer:'',mfgPart:'21KCS4S600'},{manufacturer:'LENOVO',mfgPart:'\n'}])await assert.rejects(c.lookup(p),x=>x.status===400);assert.equal(calls,0);});
test('a non-JSON response or excessively large JSON response fails safely',async()=>{for(const r of [new Response('<h1>login</h1>',{headers:{'content-type':'text/html'}}),new Response('x'.repeat(800001),{headers:{'content-type':'application/json'}})])await assert.rejects(readLimited(r),x=>x.status===502);});
test('non-JSON provider errors never return private response body',async()=>{const c=client(async()=>new Response('PRIVATE_TOKEN_PROVIDER_ERROR',{status:500}));await assert.rejects(c.lookup(product),e=>!e.message.includes('PRIVATE'));});
test('the image preview is limited by MIME and byte size',async()=>{for(const imgResp of [new Response('<svg>abc</svg>',{headers:{'content-type':'image/svg+xml'}}),new Response('HELLO',{headers:{'content-type':'image/png'}}),new Response(Buffer.alloc(220001),{headers:{'content-type':'image/jpeg'}})]){let calls=0;const c=client(async()=>++calls===1?json(body()):imgResp);const r=await c.lookup(product);assert.equal(r.imageData,null);assert.equal(r.product.hasImage,false);}});
test('404 provider response is not an invented successful product',async()=>{const r=await client(async()=>new Response('',{status:404})).lookup(product);assert.equal(r.status,'no-access-or-no-match');assert.equal(r.product,null);});
test('403 provider response is not described as a missing product',async()=>{await assert.rejects(client(async()=>new Response('',{status:403})).lookup(product),e=>/account credentials or access rights/.test(e.message));});
test('quota error is controlled and never retried',async()=>{let calls=0;await assert.rejects(client(async()=>{calls++;return new Response('',{status:429});}).lookup(product),e=>e.status===429);assert.equal(calls,1);});
test('shopping service resolves catalog part by sku server-side and invokes only one exact Icecat lookup',async()=>{const called=[],store=memoryProductStore();const shop=createShopService({env:{VERCEL_ENV:'preview'},products:store,catalog:async()=>({items:[{manufacturer:'LENOVO',mfgPart:'21KCS4S600',description:'ThinkPad Gen 12',distributorId:'14790211'}]}),content:{status:()=>({configured:true}),lookup:async p=>{called.push(p);return {status:'matched',product:{title:'test'}};}}});const result=await shop.contentLookup('14790211');assert.equal(result.status,'matched');assert.deepEqual(called,[product]);assert.equal((await store.read()).state.items.length,0);});
test('browser-submitted manufacturer and part cannot override server side catalog identity',async()=>{const store=memoryProductStore();const shop=createShopService({env:{VERCEL_ENV:'preview'},products:store,content:{lookup:async()=>{throw Error('should not be called')}}});await assert.rejects(shop.contentLookup('abc'),e=>e.status===400);});
process.env.TP_SESSION_SECRET='synthetic-icecat-handler-secret-not-real';process.env.NODE_ENV='test';
const admin=()=>sign({type:'admin',at:Date.now()});
async function route({cookie,view='content',sku='14790211',env={VERCEL_ENV:'preview'},rate=async()=>{}}={}){let calls=0,out='',headers={};const service={contentLookup:async()=>{calls++;return {status:'matched',imageData:'data:image/jpeg;base64,/9g='};},contentStatus:()=>({configured:true})};const h=createShopHandler({env,service,rate});const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(t=''){out=t;}};await h({method:'GET',url:'/api/shop?view='+view+'&sku='+sku,headers:cookie?{cookie}:{}},res);return {status:res.statusCode,headers,calls,out};}
test('content data requires staff admin and does not allow contractor access',async()=>{for(const cookie of [undefined,'__Host-tp_admin='+sign({type:'contractor',at:Date.now()})]){const r=await route({cookie});assert.equal(r.status,401);assert.equal(r.calls,0);}});
test('production and malformed customer SKUs fail before Icecat calls',async()=>{assert.equal((await route({cookie:'__Host-tp_admin='+admin(),env:{VERCEL_ENV:'production'}})).status,503);const r=await route({cookie:'__Host-tp_admin='+admin(),sku:'21KCS4S600'});assert.equal(r.status,400);assert.equal(r.calls,0);});
test('access-controlled Icecat results have no-store response headers',async()=>{const r=await route({cookie:'__Host-tp_admin='+admin()});assert.equal(r.status,200);assert.match(r.headers['Cache-Control'],/no-store/);assert.equal(r.calls,1);});
test('rate limiting precedes the product lookup',async()=>{const r=await route({cookie:'__Host-tp_admin='+admin(),rate:async()=>{throw new Error('STOP BEFORE ICECAT');}});assert.equal(r.calls,0);assert.notEqual(r.status,200);});

test('identities differing after 140 characters never count as the same brand',()=>{const long='X'.repeat(140);const r=normalizeIcecatContent(body({GeneralInfo:{...body().data.GeneralInfo,Brand:long+'Y'}}),{manufacturer:long+'Z',mfgPart:product.mfgPart});assert.equal(r.status,'identity-mismatch');});

test('a brand-logo-only gallery never becomes an inaccurate product photo',()=>{const r=normalizeIcecatContent(body({Gallery:[{Type:'BrandLogo',LowPic:'https://images.icecat.biz/img/logo.jpg'}],Image:{LowPic:'https://images.icecat.biz/img/logo.jpg'}}),product);assert.equal(r.product.hasImage,false);assert.equal(r.privateImageLink,null);});

test('Icecat gallery selects up to five distinct angles, preserving product photo identity',()=>{
 const Gallery=Array.from({length:9},(_,i)=>({No:String(i+1),Type:'ProductImage',LowPic:'https://images.icecat.biz/img/product_'+i+'.jpg',Pic500x500:'https://images.icecat.biz/img/product_'+i+'_500x500.jpg'}));
 const v=selectIcecatImages({Gallery},{mode:'gallery'});
 assert.equal(v.length,ICECAT_MAX_GALLERY_IMAGES);
 assert.equal(v[0],'https://images.icecat.biz/img/product_0_500x500.jpg');
 assert.equal(new Set(v).size,ICECAT_MAX_GALLERY_IMAGES);
 const cover=selectIcecatImages({Gallery},{mode:'cover'});assert.equal(cover[0],Gallery[0].LowPic);
});
test('duplicate gallery entries or logo/packaging media never masquerade as distinct photographs',()=>{
 const v=selectIcecatImages({Gallery:[{Type:'BrandLogo',LowPic:'https://images.icecat.biz/logo.jpg'},{Type:'ProductImage',LowPic:'https://images.icecat.biz/product-a.jpg',No:'1'},{Type:'ProductImage',LowPic:'https://images.icecat.biz/product-a.jpg',No:'2'},{Type:'Packaging',LowPic:'https://images.icecat.biz/box.jpg'}]});
 assert.equal(v.length,1);assert.match(v[0],/product-a/);
});
test('gallery mode fetches multiple product angles but cover only fetches first',async()=>{
 const urls=[];const productGallery=[{Type:'ProductImage',No:'1',LowPic:'https://images.icecat.biz/a.jpg',Pic500x500:'https://images.icecat.biz/a.jpg'},{Type:'ProductImage',No:'2',LowPic:'https://images.icecat.biz/b.jpg',Pic500x500:'https://images.icecat.biz/b.jpg'},{Type:'ProductImage',No:'3',LowPic:'https://images.icecat.biz/c.jpg',Pic500x500:'https://images.icecat.biz/c.jpg'}];
 const fetcher=async(url)=>{urls.push(String(url));if(String(url).startsWith('https://live.icecat.biz'))return json(body({Gallery:productGallery}));
 return img();};
 const cover=await client(fetcher).lookup(product);assert.equal(cover.imageData!==null,true);assert.equal(cover.images.length,1);assert.equal(urls.length,2);
 urls.length=0;
 const details=await client(fetcher).lookup(product,{media:'gallery'});assert.equal(urls.length,4);assert.equal(details.images.length,1,'identical downloaded image bytes should not create fake extra thumbnails');assert.equal(details.galleryCount,1);
 assert.doesNotMatch(JSON.stringify(details),/images\.icecat\.biz|content-token|api-token/);
});
test('unknown media mode is rejected before network access',async()=>{
 let count=0;const c=client(async()=>{count++});await assert.rejects(c.lookup(product,{media:'all-unrestricted'}),e=>e.status===400);assert.equal(count,0);
});

test('gallery falls back to the approved low-resolution image when a larger image fails',async()=>{
 const gallery=[{Type:'ProductImage',No:'1',Pic500x500:'https://images.icecat.biz/high-a.jpg',LowPic:'https://images.icecat.biz/low-a.jpg'}];
 const calls=[];const c=client(async url=>{
  calls.push(String(url));if(String(url).startsWith('https://live.icecat.biz'))return json(body({Gallery:gallery}));
  if(String(url).includes('/high-a.jpg'))return new Response('blocked',{status:403});
  return img();
 });
 const d=await c.lookup(product,{media:'gallery'});
 assert.equal(d.galleryCount,1);assert.equal(d.product.hasImage,true);
 assert.equal(calls.length,3);
 assert.ok(calls.some(x=>x.endsWith('/low-a.jpg')));
});
test('all invalid provider images yield no-image state rather than a false available-photo status',async()=>{
 const c=client(async url=>String(url).startsWith('https://live.icecat.biz')?json(body()):new Response('invalid',{status:500}));
 const d=await c.lookup(product,{media:'gallery'});
 assert.equal(d.status,'matched');assert.equal(d.product.hasImage,false);assert.equal(d.galleryCount,0);
 assert.match(d.message,/no usable product photo/);
});
