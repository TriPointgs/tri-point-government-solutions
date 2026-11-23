import {createRequire} from 'node:module';
import {resolve,join,extname} from 'node:path';
import {readFileSync,existsSync,statSync} from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';

const packageRoot=process.env.TP_BROWSER_TOOLS||'/tmp/tp-approval-browser';
const req=createRequire(resolve(packageRoot,'browser.cjs'));
const engine=req('@sparticuz/chromium'),chromium=engine.default,{chromium:playwright}=req('playwright-core');
await engine.inflate(resolve(packageRoot,'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
engine.setupLambdaEnvironment('/tmp/al2023/lib');
const root=resolve('dist'),types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((request,response)=>{
 const u=new URL(request.url,'http://127.0.0.1:4761');
 const file=resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
 const candidates=[file,file+'.html',join(file,'index.html')];
 const found=candidates.find(p=>p.startsWith(root+'/')&&existsSync(p)&&statSync(p).isFile());
 if(!found){response.writeHead(404);return response.end('not found');}
 response.writeHead(200,{'Content-Type':types[extname(found)]||'application/octet-stream'});response.end(readFileSync(found));
});
await new Promise(resolve=>server.listen(4761,'127.0.0.1',resolve));
let browser;
const results=[];
try{
 browser=await playwright.launch({args:chromium.args.filter(x=>!['--disable-web-security','--single-process'].includes(x)),executablePath:await chromium.executablePath(),headless:true});
 for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},...(width===390?{isMobile:true,hasTouch:true}:{})});
  const page=await context.newPage();
  const errors=[],outside=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4761/'))outside.push(r.url())});
  page.on('dialog',dialog=>dialog.accept());
  let rec={
   id:'5335d560-53a0-4f5b-b8b6-c50e322c0788',company:'Synthetic Field Services',
   contact:'Test Person',email:'contractor@example.org',phone:'',status:'new',trade:'janitorial',zip:'34748',state:'FL',serviceCounties:['Lake'],
   submittedAt:'2026-11-01T00:00:00Z',consent:true,verification:'self-reported',
   licensed:'unknown',insured:'unknown',workersComp:'unknown',sam:'unknown',experience:[],interests:[],description:'Synthetic application',source:'test',consentVersion:'test',
   crewSize:4,maxProject:10000
  };
  let welcomeSent=0;
  await page.route('**/api/admin*',async route=>{
   const req=route.request();
   if(req.method()==='GET')return route.fulfill({status:200,json:{records:[rec],cursor:null}});
   return route.fulfill({status:200,json:{ok:true}});
  });
  await page.route('**/api/notifications*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(req.method()==='GET'){
    if(u.searchParams.get('view')==='welcome-preview'){
     if(rec.status!=='reviewed'&&rec.status!=='approved')return route.fulfill({status:409,json:{error:'not reviewed'}});
     return route.fulfill({status:200,json:{to:rec.email,subject:'Welcome to the Tri-Point subcontractor network',text:'Your company has been approved to participate.',previewOnly:true,deliveryEnabled:false}});
    }
    return route.fulfill({status:200,json:{newCount:rec.status==='new'?1:0,emailEnabled:false,welcomeEmailEnabled:false}});
   }
   const action=req.postDataJSON();
   if(action.action==='send-welcome'){welcomeSent++;return route.fulfill({status:503,json:{error:'Sending disabled'}})}
   if(action.expectedStatus!==rec.status)return route.fulfill({status:409,json:{error:'Stale decision'}});
   rec={...rec,status:action.action==='mark-reviewed'?'reviewed':action.action==='approve'?'approved':'declined',
    ...(action.action==='approve'?{welcomeNotice:{state:'held'}}:{})};
   return route.fulfill({status:200,json:{ok:true,id:rec.id,status:rec.status,welcomeNotice:rec.welcomeNotice?.state||'not-applicable'}});
  });
  const response=await page.goto('http://127.0.0.1:4761/contractors/admin');
  assert.equal(response.status(),200);
  try{await page.locator('article.record').first().waitFor({timeout:6000});}catch(error){console.error('BROWSER_DIAGNOSTIC',JSON.stringify({width,errors,outside,body:(await page.locator('body').innerText()).slice(0,2400),html:(await page.content()).slice(0,850)}));throw error;}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
  await page.locator('article.record').first().locator('summary').click();
  await page.getByRole('button',{name:'Mark under review'}).click();
  await page.locator('article.record').first().locator('summary').click();
  await page.getByRole('button',{name:'Preview welcome email'}).click();
  await page.locator('[data-welcome-output]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-welcome-output]').innerText(),/PREVIEW ONLY/);
  await page.getByRole('button',{name:'Approve for network'}).click();
  await page.locator('article.record').first().locator('summary').click();
  await page.locator('article.record .fine').filter({hasText:'Welcome email:'}).waitFor();
  assert.equal(welcomeSent,0);
  assert.match(await page.locator('article.record').first().innerText(),/Approved for network/);
  // Exercise independent decline path with a new synthetic record.
  rec={...rec,status:'reviewed',welcomeNotice:undefined};
  await page.reload();
  await page.locator('article.record').first().waitFor();
  await page.locator('article.record').first().locator('summary').click();
  await page.getByRole('button',{name:'Decline application'}).click();
  await page.locator('article.record').first().getByText('Declined',{exact:false}).first().waitFor();
  assert.equal(welcomeSent,0);
  assert.deepEqual(errors,[]);
  assert.deepEqual(outside,[]);
  await page.screenshot({path:'/tmp/tri-network-approval-'+width+'.png',fullPage:true});
  results.push({width,passed:true,approvalVisible:true,welcomeHeld:true,declineNoEmail:true,externalRequests:0,consoleErrors:0});
  await context.close();
 }
 console.log('SUBCONTRACTOR_APPROVAL_BROWSER '+JSON.stringify(results));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
