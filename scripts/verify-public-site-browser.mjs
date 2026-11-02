// Execute manually with isolated optional browser tools, after a clean local build.
import {createRequire} from 'node:module';
import {resolve,join,extname,normalize,sep} from 'node:path';
import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';
const root=process.env.TP_BROWSER_TOOLS||'/tmp/tp-site-browser-tools',require=createRequire(resolve(root,'test.cjs'));
const pkg=require('@sparticuz/chromium'),chromium=pkg.default,{chromium:pw}=require('playwright-core');
await pkg.inflate(resolve(root,'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));pkg.setupLambdaEnvironment('/tmp/al2023/lib');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.xml':'application/xml'};
const server=http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.includes('..'))throw Error('unsafe');name=name==='/'?'/index.html':name;if(!extname(name))name+='.html';const f=normalize(join(process.cwd(),'dist',name));if(!f.startsWith(join(process.cwd(),'dist')+sep))throw Error('unsafe');const data=fs.readFileSync(f);res.setHeader('Content-Type',mime[extname(f)]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end('Not Found');}});await new Promise(ok=>server.listen(8972,'127.0.0.1',ok));
let browser;const checks=[];
try{browser=await pw.launch({args:chromium.args.filter(x=>!['--disable-web-security','--single-process'].includes(x)),executablePath:await chromium.executablePath(),headless:true});
for(const width of [390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[],external=[],unloaded=[];
 page.on('pageerror',x=>errors.push(x.message));page.on('requestfailed',x=>unloaded.push(x.url()));
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='localhost')return route.continue();external.push(route.request().url());return route.abort();});
 for(const item of [{route:'/',title:'Technology that moves'},{route:'/marketplace',title:'Our Marketplace Is'},{route:'/contact',title:'Tell us what you need'},{route:'/contractors',title:null},{route:'/privacy',title:null}]){
  const res=await page.goto('http://localhost:8972'+item.route,{waitUntil:'networkidle'});assert.equal(res.status(),200,item.route);
  assert.equal(await page.locator('header.experience-header').count(),1,item.route);assert.equal(await page.locator('footer.experience-footer').count(),1,item.route);
  assert.equal(await page.locator('a.experience-brand img').getAttribute('src'),'/assets/tripoint-logo.svg');
  if(item.title)assert.match(await page.locator('main').innerText(),new RegExp(item.title));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow '+width+' '+item.route);
  if(item.route==='/marketplace'){
   assert.equal(await page.locator('[href*="checkout"], [data-cart-action], button:has-text("Buy now")').count(),0);
   assert.match(await page.locator('main').innerText(),/We're excited to bring you the Tri-Point Marketplace soon/);
   await page.screenshot({path:'/tmp/tp-site-marketplace-'+width+'.png',fullPage:true});
  }
  if(item.route==='/contact')assert.equal(await page.locator('a.email').getAttribute('href'),'mailto:info@tripointgs.com?subject=Requirement%20Inquiry%20for%20Tri-Point');
 }
 await page.goto('http://localhost:8972/');
 if(width===390){await page.locator('.experience-menu-toggle').click();assert.equal(await page.locator('.experience-menu-toggle').getAttribute('aria-expanded'),'true');}
 await page.locator('.experience-nav a[href="/marketplace"]').click();assert.match(await page.locator('main h1').innerText(),/Marketplace Is/);
 await page.locator('main a.primary[href="/contact"]').click();assert.match(await page.locator('main h1').innerText(),/Tell us/);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(unloaded,[]);
 checks.push({width,pages:5,header:true,menu:true,comingSoon:true,contact:true,errors:errors.length,external:external.length});await context.close();
}
console.log('PUBLIC_SITE_BROWSER_PASS '+JSON.stringify(checks));}finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
