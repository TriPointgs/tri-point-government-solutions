import {wasabiPage} from '../lib/wasabi-page.mjs';
import {ptzopticsPage} from '../lib/ptzoptics-page.mjs';
import {shopPreviewPage} from '../lib/shop-preview-page.mjs';
import {contactPage} from '../lib/contact-page.mjs';
import assert from 'node:assert/strict';
import {orderLabPage} from '../lib/order-lab-page.mjs';
import fs from 'node:fs';
import {applySiteExperience,homeHero,marketplacePage} from '../lib/site-experience.mjs';
const preview=process.env.VERCEL_ENV!=='production';
fs.mkdirSync('dist/solutions',{recursive:true});
fs.writeFileSync('dist/solutions/wasabi.html',wasabiPage());
fs.writeFileSync('dist/solutions/ptzoptics.html',ptzopticsPage());
fs.writeFileSync('dist/contact.html',contactPage());
const quoteOptions=[];
for(const slug of ['wasabi','ptzoptics']){
 const catalog=JSON.parse(fs.readFileSync(`content/${slug}/catalog.json`,'utf8'));
 for(const product of catalog.products.filter(product=>product.status!=='legacy')){
  if(!product.name||!product.image?.startsWith('/assets/'))continue;
  quoteOptions.push({brand:catalog.brand,name:product.name,description:catalog.brand+' · '+product.name,category:product.category,image:product.image});
 }
}
fs.writeFileSync('dist/assets/quote-options.json',JSON.stringify(quoteOptions));
fs.writeFileSync('dist/marketplace.html',marketplacePage().replace('content="noindex, nofollow"',`content="${preview?'noindex, nofollow':'index, follow'}"`));
for(const file of fs.readdirSync('dist',{recursive:true}).map(x=>x.replaceAll('\\','/')).filter(x=>x.endsWith('.html'))){
 let html=fs.readFileSync('dist/'+file,'utf8');const route=file==='index.html'?'/':'/'+file.slice(0,-5);
 if(route==='/'){
  html=html.replace(/<section class="hero">[\s\S]*?<\/section>/,homeHero());
  html=html.replace('id="top"','id="main"');
 }
 if(route==='/privacy')html=html.replace('</article>','<h2 id="website-inquiries">Website quote and contact requests</h2><p>When you use the website contact form, Tri-Point stores the organization and contact details, selected interests, brands, items and quantities, project requirements, delivery details, review preferences, consent, and request reference in a private inquiry workspace. This is separate from subcontractor profiles and does not create a customer account or purchase. Authorized staff use the request to respond to you. Hosting and email providers may process necessary data to operate this workflow. An enabled internal alert contains only a reference and private review link, not your request details. Preview requests are kept separate and do not send email. Item selections may stay in this browser tab while you move between pages; contact details are not stored in browser storage. A tax-exemption review request does not approve an exemption. Do not submit sensitive documents, passwords, tax identifiers, or payment information through this form. Contact info@tripointgs.com to request access, correction, or deletion, subject to identity verification and recordkeeping obligations.</p></article>');
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
const dynamic=new Set(['/admin/stripe-checkout','/admin/fulfillment','/admin/launch','/shop-preview','/admin/catalog','/admin/orders','/admin/products','/admin/inquiries','/contractors/admin/zoom','/solutions/zoom','/solutions/zoom/quote']);
const htmlPages=fs.readdirSync('dist',{recursive:true}).map(p=>p.replaceAll('\\','/')).filter(p=>p.endsWith('.html'));
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

if(preview){
 const desktop='Lenovo ThinkCentre neo 50q Gen 5 Tiny desktop (TD SKU 14784711 / MPN 13B90032US)';
 const quoteUrl='/contact?manufacturer=Lenovo&topic=Product%20quote&product='+encodeURIComponent(desktop);
 const card=`<section class="desktop-review" aria-labelledby="desktop-review-title"><div><p class="eyebrow">FIRST DESKTOP UNDER REVIEW · QUOTE ONLY</p><h2 id="desktop-review-title">Lenovo ThinkCentre neo 50q Gen 5 Tiny</h2><p><strong>TD SKU 14784711 · Lenovo part 13B90032US.</strong> The listed configuration includes preinstalled Windows 11 Pro, keyboard and mouse, and a one-year onsite manufacturer warranty. Confirm the exact configuration and warranty terms before quoting.</p><p>Pricing, availability, delivery and eligibility require staff review. TD marks this SKU as not TAA compliant; check each solicitation's requirements. This card is not an offer or order.</p></div><a href="${quoteUrl}">Request a quote for this desktop →</a></section>`;
 const shop=shopPreviewPage().replace('<div class="shop-layout">',card+'<div class="shop-layout">');
 assert.equal((shop.match(/<h1\b/g)||[]).length,1);assert.match(shop,/id="shop-main"/);assert.match(shop,/TD SKU 14784711/);for(const src of ['/assets/shop-preview.js','/assets/shop-preview.css','/assets/tripoint-logo.svg'])assert.ok(fs.existsSync('dist'+src));fs.writeFileSync('dist/marketplace.html',shop);console.log('Shopping preview: quote-only desktop review card installed; production marketplace unchanged.');
}
