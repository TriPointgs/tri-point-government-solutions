import {shopPreviewPage} from '../lib/shop-preview-page.mjs';
import {contactPage} from '../lib/contact-page.mjs';
import assert from 'node:assert/strict';
import {orderLabPage} from '../lib/order-lab-page.mjs';
import fs from 'node:fs';
import {applySiteExperience,homeHero,marketplacePage} from '../lib/site-experience.mjs';
const preview=process.env.VERCEL_ENV!=='production';
fs.writeFileSync('dist/contact.html',contactPage());
fs.writeFileSync('dist/marketplace.html',marketplacePage().replace('content="noindex, nofollow"',`content="${preview?'noindex, nofollow':'index, follow'}"`));
for(const file of fs.readdirSync('dist',{recursive:true}).filter(x=>x.endsWith('.html'))){
 let html=fs.readFileSync('dist/'+file,'utf8');const route=file==='index.html'?'/':'/'+file.slice(0,-5);
 if(route==='/'){
  html=html.replace(/<section class="hero">[\s\S]*?<\/section>/,homeHero());
  html=html.replace('id="top"','id="main"');
 }
 if(route==='/privacy')html=html.replace('</article>','<h2 id="website-inquiries">Website quote and contact requests</h2><p>When you use the website contact form, Tri-Point stores the organization, contact information, product requirements, message, consent, and a request reference in a private inquiry workspace. This is separate from subcontractor profiles and does not create a customer account or purchase. Authorized staff use the request to respond to you. Hosting and email providers may process necessary data to operate this workflow. Preview requests are kept separate and do not send email. Do not submit sensitive documents, passwords, tax identifiers, or payment information through this form. Contact info@tripointgs.com to request access, correction, or deletion, subject to identity verification and recordkeeping obligations.</p></article>');
 if(route==='/contractors/join')html=html.replace('<form id="join-form"',`<p class="signup-environment-note">${preview?'Preview test: your application is stored in the preview directory. No confirmation email or staff email alert is sent from this preview.':'After submitting, keep your on-screen reference. This form does not send an automatic confirmation email to the applicant or create a sign-in account.'}</p><form id="join-form"`);
 if(route==='/contractors/thanks')html=html.replace('<h2>Application reference</h2>','<h2>Application reference</h2><p class="fine">A saved reference confirms website receipt. It is not an approval, account activation, or email-delivery confirmation.</p>');
 if(route==='/contractors/admin'||route==='/contractors/admin/opportunities')html=html.replace('<div class="toolbar">','<div class="toolbar"><a class="button secondary" href="/admin/inquiries">Website inquiries</a>');
 fs.writeFileSync('dist/'+file,applySiteExperience(html,{route}));
}
if(!preview){const p='dist/sitemap.xml';let s=fs.readFileSync(p,'utf8');if(!s.includes('/marketplace'))fs.writeFileSync(p,s.replace('</urlset>','<url><loc>https://tripointgs.com/marketplace</loc></url></urlset>'));}
console.log('Shared Tri-Point experience: responsive navigation, sourcing categories, existing content and access boundaries preserved.');

if(preview){fs.mkdirSync('dist/preview',{recursive:true});fs.writeFileSync('dist/preview/orders.html',orderLabPage());fs.copyFileSync('lib/commerce-order.mjs','dist/assets/order-lab-core.mjs');}
else {fs.rmSync('dist/preview',{recursive:true,force:true});fs.rmSync('dist/assets/order-lab-core.mjs',{force:true});fs.rmSync('dist/assets/order-lab.js',{force:true});}
for(const file of ['dist/contractors/admin.html','dist/contractors/admin/opportunities.html']){let html=fs.readFileSync(file,'utf8');if(preview)html=html.replace('<div class="toolbar">','<div class="toolbar"><a class="button secondary" href="/preview/orders">Order automation lab</a>');fs.writeFileSync(file,html);}

for(const file of ['dist/contractors/admin.html','dist/contractors/admin/opportunities.html']){if(preview){let html=fs.readFileSync(file,'utf8');html=html.replace('<div class="toolbar">','<div class="toolbar"><a class="button secondary" href="/admin/products">Product Control Center</a>');fs.writeFileSync(file,html);}}
const dynamic=new Set(['/admin/launch','/shop-preview','/admin/catalog','/admin/orders','/admin/products','/admin/inquiries','/contractors/admin/zoom','/solutions/zoom','/solutions/zoom/quote']);
const htmlPages=fs.readdirSync('dist',{recursive:true}).filter(p=>p.endsWith('.html'));
for(const page of htmlPages){
 const html=fs.readFileSync('dist/'+page,'utf8');
 assert.equal((html.match(/<h1\b/g)||[]).length,1,'One primary heading: '+page);
 assert.equal((html.match(/class="experience-header"/g)||[]).length,1,'Shared header: '+page);
 assert.match(html,/id="main"/,'Skip-link destination missing: '+page);
 for(const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){
  const target=m[1];if(target.startsWith('/api/')||dynamic.has(target))continue;
  assert.ok(fs.existsSync('dist'+(target==='/'?'/index.html':target))||fs.existsSync('dist'+target+'.html'),'Missing final link: '+target+' in '+page);
 }
 if(!page.startsWith('contractors/admin')&&!page.startsWith('preview/'))assert.doesNotMatch(html,/href="\/(learn|government-contracts)(?:\/|")|href="\/solutions\/zoom/,'Retired or gated public navigation: '+page);
}
if(!preview){assert.ok(!fs.existsSync('dist/preview/orders.html'));assert.ok(!fs.existsSync('dist/assets/order-lab-core.mjs'));assert.ok(!fs.existsSync('dist/assets/order-lab.js'));}
console.log(`Final experience validation passed for ${htmlPages.length} HTML pages. Simulation build: ${preview}.`);

if(preview){const shop=shopPreviewPage();assert.equal((shop.match(/<h1\b/g)||[]).length,1);assert.match(shop,/id="shop-main"/);for(const src of ['/assets/shop-preview.js','/assets/shop-preview.css','/assets/tripoint-logo.svg'])assert.ok(fs.existsSync('dist'+src));fs.writeFileSync('dist/marketplace.html',shop);console.log('Shopping preview: simplified storefront installed; production marketplace unchanged.');}
