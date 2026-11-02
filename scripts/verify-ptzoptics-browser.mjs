import {createRequire} from 'node:module';
import {resolve,join,extname} from 'node:path';
import {readFileSync,existsSync,statSync} from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
const root=process.env.TP_BROWSER_TOOLS||'/tmp/tp-site-browser',require=createRequire(resolve(root,'test.cjs')),pkg=require('@sparticuz/chromium'),chromium=pkg.default,{chromium:pw}=require('playwright-core');
await pkg.inflate(resolve(root,'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));pkg.setupLambdaEnvironment('/tmp/al2023/lib');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost:4771'),p=join(process.cwd(),'dist',u.pathname==='/'?'index.html':u.pathname),file=[p,p+'.html',join(p,'index.html')].find(f=>f.startsWith(join(process.cwd(),'dist'))&&existsSync(f)&&statSync(f).isFile());if(!file){res.writeHead(404);return res.end();}const t={'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.webp':'image/webp'};res.writeHead(200,{'content-type':t[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));});
await new Promise(done=>server.listen(4771,'127.0.0.1',done));let browser;const results=[];
try{browser=await pw.launch({args:chromium.args.filter(x=>!['--disable-web-security','--single-process'].includes(x)),executablePath:await chromium.executablePath(),headless:true});
for(const width of [390,768,1440]){const context=await browser.newContext({viewport:{width,height:960},...(width===390?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage(),errors=[],fail=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>fail.push(r.url()));
for(const route of ['/','/marketplace','/solutions/ptzoptics']){const res=await page.goto('http://127.0.0.1:4771'+route);assert.equal(res.status(),200,route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' overflow '+width);assert.equal(await page.locator('.experience-brand img').evaluate(x=>x.complete&&x.naturalWidth>0),true);if(route==='/solutions/ptzoptics'){assert.match(await page.locator('h1').first().innerText(),/PTZOptics/);assert.equal(await page.locator('.ptz-asset-empty').count(),2);assert.equal(await page.locator('main form').count(),0);assert.equal(await page.locator('link[href="/assets/ptzoptics.css"]').count(),1);}}
assert.deepEqual(errors,[]);assert.deepEqual(fail,[]);await page.screenshot({path:'/tmp/ptzoptics-public-'+width+'.png',fullPage:true});results.push({width,passed:true,routes:3,errors:0,failedRequests:0});await context.close();}
console.log('PTZOPTICS_BROWSER '+JSON.stringify(results));}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
