// Explicit Linux test harness with synthetic providers and synthetic browser cookies.
// Install @sparticuz/chromium and playwright-core in TP_BROWSER_TOOLS; not production dependencies.
import {resolve} from 'node:path';import {createRequire} from 'node:module';import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
import {cartPaymentFixture} from '../tests/cart-checkout-fixture.mjs';
import {createCartCheckoutHandler} from '../lib/cart-checkout-handler.mjs';
import {sign} from '../lib/security.mjs';
const toolsRoot=process.env.TP_BROWSER_TOOLS||'/tmp/tp-browser-tools',require=createRequire(resolve(toolsRoot,'test.cjs')),pkg=require('@sparticuz/chromium'),chromium=pkg.default,{chromium:pw}=require('playwright-core');
await pkg.inflate(resolve(toolsRoot,'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));pkg.setupLambdaEnvironment('/tmp/al2023/lib');
process.env.NODE_ENV='test';process.env.TP_SESSION_SECRET='synthetic-browser-acceptance-key-not-a-real-secret';
const fixtures=new Map();
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost:3000'),key=req.headers['x-synthetic-browser'];const t=fixtures.get(key);
 if(u.pathname==='/admin/checkout-recovery')req.url='/api/shop?view=cart-checkout-recovery-page';
 if(u.pathname==='/shop-preview/checkout')req.url='/api/shop?view=cart-checkout-page'+(u.search?'&'+u.search.slice(1):'');
 if(u.pathname==='/shop-preview/checkout-return')req.url='/api/shop?view=cart-checkout-return'+(u.search?'&'+u.search.slice(1):'');
 if(req.url.startsWith('/api/shop')){if(!t){res.statusCode=401;return res.end('{"error":"No synthetic session"}');}return createCartCheckoutHandler({env:t.env,service:t.service,rate:async()=>{}})(req,res);}
 if(u.pathname.startsWith('/assets/')&&!u.pathname.includes('..')){const p=process.cwd()+u.pathname;if(fs.existsSync(p)){res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'image/svg+xml');return res.end(fs.readFileSync(p));}}
 res.statusCode=404;res.end();}catch(e){res.statusCode=500;res.end('synthetic server failure');}});
await new Promise(r=>server.listen(3000,'127.0.0.1',r));let browser;const results=[];
try{
 for(const [name,settings] of [['desktop',{viewport:{width:1440,height:1100}}],['mobile-touch',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}],['tablet-keyboard',{viewport:{width:768,height:1024}}]]){
  browser=await pw.launch({args:chromium.args.filter(x=>x!=='--disable-web-security'),executablePath:await chromium.executablePath(),headless:true});
  const t=await cartPaymentFixture();fixtures.set(name,t);let expired=false,expiryCalls=0;t.env.TP_STRIPE_TEST_CHECKOUT_EXPIRY_ENABLED='true';t.client.checkout.sessions.expire=async()=>{expiryCalls++;expired=true;t.setSessionPatch({status:'expired',payment_status:'unpaid',url:null});return {};};
  let currentOrderId=null;
  const ctx=await browser.newContext({...settings,extraHTTPHeaders:{'x-synthetic-browser':name}}),errors=[],unexpected=[],posts=[];let stripeNavigations=0;
  await ctx.route('**/*',r=>{const url=new URL(r.request().url());if(url.hostname==='localhost')return r.continue();if(url.hostname==='checkout.stripe.com'){stripeNavigations++;return r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><h1>Mock payment page</h1><a href="http://localhost:3000/shop-preview/checkout-return?order='+currentOrderId+'">Return to merchant</a>'});}unexpected.push(url.hostname);return r.abort();});
  await ctx.addCookies([{name:'__Host-tp_admin',value:sign({type:'admin',at:Date.now()}),domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Strict'},{name:'__Host-tp_shop_preview',value:sign({type:'shop-preview',id:t.owner,at:Date.now()}),domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  const page=await ctx.newPage();page.setDefaultTimeout(8000);await page.clock.install({time:new Date(t.now())});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(JSON.parse(r.postData()));});
  await page.goto('http://localhost:3000/shop-preview/checkout?review='+t.request.reviewId);await page.getByText('Approved test checkout settings are available.').waitFor();assert.equal(await page.locator('#cc-finalize').isDisabled(),true);assert.equal(posts.length,0);
  await page.check('#cc-accept');await page.check('#cc-test');if(name==='tablet-keyboard'){await page.locator('#cc-finalize').focus();await page.keyboard.press('Enter');}else await page.click('#cc-finalize');
  await page.getByRole('heading',{name:'Finalized test order; payment not confirmed'}).waitFor();const orderId=new URL(page.url()).searchParams.get('order');assert.ok(orderId);currentOrderId=orderId;assert.match(await page.locator('#cc-totals').textContent(),/257.50/);assert.equal(t.counts.create,0);
  await page.check('#cc-pay-consent');await page.click('#cc-open');await page.getByRole('heading',{name:'Mock payment page'}).waitFor();assert.equal(stripeNavigations,1);
  await page.getByRole('link',{name:'Return to merchant'}).click();await page.getByRole('heading',{name:'Finalized test order; payment not confirmed'}).waitFor();assert.equal(posts.some(x=>x.action==='reconcile-order'),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(name==='mobile-touch'){
   await page.getByText('Close an unpaid test checkout',{exact:true}).click();assert.equal(await page.locator('#cc-close').isDisabled(),true);await page.check('#cc-close-consent');await page.click('#cc-close');await page.getByRole('heading',{name:'Test checkout closed; no new payment'}).waitFor();assert.equal(expired,true);assert.equal(expiryCalls,1);assert.equal(await page.locator('#cc-open').isDisabled(),true);await page.reload();await page.getByRole('heading',{name:'Test checkout closed; no new payment'}).waitFor();
  }else{
   t.paid();await page.click('#cc-reconcile');await page.getByRole('heading',{name:'Test payment verified and saved'}).waitFor();assert.equal(await page.locator('#cc-open').isDisabled(),true);
   const before={...t.counts};await page.click('#cc-refresh');await page.getByText('Saved status loaded; this did not contact Stripe.').waitFor();assert.deepEqual(t.counts,before);
   t.env.TP_CART_CHECKOUT_PREVIEW_ENABLED='false';await page.reload();await page.getByText('Private cart checkout activation is off.').waitFor();await page.locator('#cc-history-list a').first().waitFor();assert.equal(await page.locator('#cc-open').isDisabled(),true);assert.equal(await page.locator('#cc-reconcile').isDisabled(),false);
   const original=t.client.checkout.sessions.retrieve;t.client.checkout.sessions.retrieve=async()=>{throw Error('synthetic Session timeout');};await page.click('#cc-reconcile');await page.getByRole('heading',{name:'Payment check unavailable — do not pay again'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Saved payment requires a fresh check'}).waitFor();assert.doesNotMatch(await page.locator('#cc-payment').textContent(),/^Stripe capture confirmed/);
   t.client.checkout.sessions.retrieve=original;await page.click('#cc-reconcile');await page.getByRole('heading',{name:'Test payment verified and saved'}).waitFor();t.advance(900001);await page.clock.fastForward(900001);await page.click('#cc-reconcile');await page.getByRole('heading',{name:'Captured payment — held for review'}).waitFor();assert.equal(await page.locator('#cc-open').isDisabled(),true);
  }
  await ctx.clearCookies({name:'__Host-tp_shop_preview'});
  await page.goto('http://localhost:3000/admin/checkout-recovery');await page.getByRole('heading',{name:'Recover a saved test order.'}).waitFor();await page.fill('#recovery-id',orderId);await page.click('#recovery-read');await page.locator('#recovery-reference').filter({hasText:'TP-TEST-ORDER-'}).waitFor();assert.equal(await page.locator('#recovery-recheck').isDisabled(),true);await page.check('#recovery-consent');await page.click('#recovery-recheck');await page.getByText('Server verification finished. No new payment, refund, customer email or TD order was created.').waitFor();await page.fill('#recovery-id','bad');assert.equal(await page.locator('#recovery-read').isDisabled(),true);assert.equal(await page.locator('#recovery-recheck').isDisabled(),true);assert.equal(await page.locator('#recovery-title').textContent(),'No order selected');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/checkout-'+name+'.png',fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.equal(t.counts.create,1);
  results.push({browser:name,width:settings.viewport.width,passed:true,errors:errors.length,externalRequests:unexpected.length,mockStripeNavigations:stripeNavigations,mockSessions:t.counts.create,expiryCalls,realPayments:0});await ctx.close();await browser.close();browser=null;
 }
 console.log('CHECKOUT_STRICT_COOKIE_ACCEPTANCE '+JSON.stringify(results));fs.writeFileSync('/tmp/checkout-strict-cookie-results.json',JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
