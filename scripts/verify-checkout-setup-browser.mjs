// Synthetic local HTTP/browser acceptance; no merchant policies or provider actions.
import {createRequire} from 'node:module';import {resolve} from 'node:path';import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';
import {createCheckoutSetupService,memoryCheckoutSetupStore} from '../lib/checkout-setup-store.mjs';
import {createCheckoutSetupHandler} from '../lib/checkout-setup-handler.mjs';
import {createCartCheckoutHandler} from '../lib/cart-checkout-handler.mjs';
import {sign} from '../lib/security.mjs';
const tools=process.env.TP_BROWSER_TOOLS||'/tmp/tp-browser-tools',require=createRequire(resolve(tools,'test.cjs')),pkg=require('@sparticuz/chromium'),chromium=pkg.default,{chromium:pw}=require('playwright-core');
await pkg.inflate(resolve(tools,'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));pkg.setupLambdaEnvironment('/tmp/al2023/lib');
process.env.NODE_ENV='test';process.env.TP_SESSION_SECRET='synthetic-setup-browser-signature-key-not-a-real-secret';
const fixtures=new Map(),server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost:3000');if(url.pathname.startsWith('/assets/')){const path=process.cwd()+url.pathname;if(fs.existsSync(path)&&fs.statSync(path).isFile()){res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'image/svg+xml');return res.end(fs.readFileSync(path));}}
  const t=fixtures.get(req.headers['x-synthetic-setup']);if(!t){res.statusCode=401;return res.end();}
  if(url.pathname==='/admin/checkout-setup')req.url='/api/shop?view=cart-checkout-setup-page';
  if(t.loseReply&&req.method==='POST'){t.loseReply=false;const end=res.end.bind(res);res.end=()=>end('{');}
  await t.handler(req,res);
 }catch{res.statusCode=500;res.end('Synthetic HTTP failure');}
});await new Promise(r=>server.listen(3000,'127.0.0.1',r));let browser;const reports=[];
try{
 for(const [name,width] of [['desktop',1440],['mobile',390],['tablet',768]]){
  const env={VERCEL_ENV:'preview',TP_STRIPE_TEST_ACCOUNT_ID:'acct_SYNTHETICBROWSER'},store=memoryCheckoutSetupStore(),service=createCheckoutSetupService({env,store}),requests=[];
  const t={loseReply:false,handler:null};const configuration=async()=>({ready:false,historyReady:false,blockers:['Synthetic merchant approval is still pending.']});
  const setup=createCheckoutSetupHandler({env,service:{read:()=>service.read(),save:async input=>{requests.push(structuredClone(input));return service.save(input);}},configuration,rate:async()=>{}});
  t.handler=createCartCheckoutHandler({env,service:{configuration},rate:async()=>{},setup});fixtures.set(name,t);
  browser=await pw.launch({args:chromium.args.filter(x=>x!=='--disable-web-security'),executablePath:await chromium.executablePath(),headless:true});
  const ctx=await browser.newContext({viewport:{width,height:1000},...(name==='mobile'?{isMobile:true,hasTouch:true}:{}),extraHTTPHeaders:{'x-synthetic-setup':name}}),errors=[],external=[];
  await ctx.route('**/*',route=>{if(new URL(route.request().url()).hostname==='localhost')return route.continue();external.push(route.request().url());return route.abort();});
  await ctx.addCookies([{name:'__Host-tp_admin',value:sign({type:'admin',at:Date.now()}),domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  const page=await ctx.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/admin/checkout-setup');await page.getByText('Private draft loaded. No payment or approved policy was changed.').waitFor();assert.equal(requests.length,0);assert.equal(await page.locator('#setup-save').isDisabled(),true);
  await page.fill('#setup-version','draft-browser');const terms='SYNTHETIC TERMS ONLY. <img src=x onerror="globalThis.injected=true"> & Ω';await page.fill('#setup-terms',terms);
  await page.fill('#setup-shipping','Synthetic draft shipping note.');await page.fill('#setup-tax','Synthetic draft tax note, no registration asserted.');await page.selectOption('#setup-access','both');await page.click('#setup-add');
  await page.getByRole('textbox',{name:'TD SKU',exact:true}).fill('12345');await page.getByRole('textbox',{name:'Manufacturer part',exact:true}).fill('TEST-PART');await page.getByRole('textbox',{name:'Stripe tax code',exact:true}).fill('txcd_99999999');
  assert.equal(await page.locator('#setup-export').isHidden(),true);if(name==='tablet'){await page.locator('#setup-save').focus();await page.keyboard.press('Enter');}else await page.click('#setup-save');
  await page.getByText(/Private draft saved and verified/).waitFor();assert.match(await page.locator('#setup-version-status').textContent(),/revision 1/);assert.equal(await page.evaluate(()=>globalThis.injected),undefined);assert.equal((await service.read()).approved,false);
  const downloadPromise=page.waitForEvent('download');await page.click('#setup-export');const download=await downloadPromise,packet=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(packet.fields.termsText,terms);assert.equal(packet.approved,false);assert.equal(packet.checkoutActivated,false);
  await page.fill('#setup-shipping','Second synthetic draft');t.loseReply=true;await page.click('#setup-save');await page.getByRole('button',{name:'Retry same draft save'}).waitFor();assert.equal(await page.locator('#setup-shipping').isDisabled(),true);assert.equal((await service.read()).revision,2);const lost=structuredClone(requests.at(-1));
  await page.click('#setup-save');await page.getByText(/Private draft saved and verified/).waitFor();assert.deepEqual(requests.at(-1),lost);assert.equal((await service.read()).revision,2);
  const second=await ctx.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto('http://localhost:3000/admin/checkout-setup');await second.getByText('Private draft loaded. No payment or approved policy was changed.').waitFor();
  await page.fill('#setup-shipping','Third draft wins');await page.click('#setup-save');await page.getByText(/Private draft saved and verified/).waitFor();
  await second.fill('#setup-shipping','Stale edit must not win');await second.click('#setup-save');await second.getByText(/Another editor changed this draft/).waitFor();assert.equal(await second.locator('#setup-save').isDisabled(),true);assert.equal((await service.read()).fields.shippingNotes,'Third draft wins');
  second.once('dialog',dialog=>dialog.accept());await second.click('#setup-reload');await second.getByText('Private draft loaded. No payment or approved policy was changed.').waitFor();assert.equal(await second.locator('#setup-shipping').inputValue(),'Third draft wins');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  reports.push({name,width,passed:true,revision:(await service.read()).revision,lostReplyRecovered:true,competingEditorBlocked:true,exportVerified:true,externalRequests:external.length,browserErrors:errors.length});await ctx.close();await browser.close();browser=null;
 }
 console.log('CHECKOUT_SETUP_BROWSER '+JSON.stringify(reports));fs.writeFileSync('/tmp/checkout-setup-browser-results.json',JSON.stringify(reports,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
