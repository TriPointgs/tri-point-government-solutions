import assert from 'node:assert/strict';
import {orderLabPage} from '../lib/order-lab-page.mjs';
import fs from 'node:fs';
import {applySiteExperience,homeHero,marketplacePage} from '../lib/site-experience.mjs';
const preview=process.env.VERCEL_ENV!=='production';
fs.writeFileSync('dist/marketplace.html',marketplacePage().replace('content="noindex, nofollow"',`content="${preview?'noindex, nofollow':'index, follow'}"`));
for(const file of fs.readdirSync('dist',{recursive:true}).filter(x=>x.endsWith('.html'))){
 let html=fs.readFileSync('dist/'+file,'utf8');const route=file==='index.html'?'/':'/'+file.slice(0,-5);
 if(route==='/'){
  html=html.replace(/<section class="hero">[\s\S]*?<\/section>/,homeHero());
  html=html.replace('id="top"','id="main"');
 }
 fs.writeFileSync('dist/'+file,applySiteExperience(html,{route}));
}
if(!preview){const p='dist/sitemap.xml';let s=fs.readFileSync(p,'utf8');if(!s.includes('/marketplace'))fs.writeFileSync(p,s.replace('</urlset>','<url><loc>https://tripointgs.com/marketplace</loc></url></urlset>'));}
console.log('Shared Tri-Point experience: responsive navigation, sourcing categories, existing content and access boundaries preserved.');

if(preview){fs.mkdirSync('dist/preview',{recursive:true});fs.writeFileSync('dist/preview/orders.html',orderLabPage());fs.copyFileSync('lib/commerce-order.mjs','dist/assets/order-lab-core.mjs');}
else {fs.rmSync('dist/preview',{recursive:true,force:true});fs.rmSync('dist/assets/order-lab-core.mjs',{force:true});fs.rmSync('dist/assets/order-lab.js',{force:true});}
for(const file of ['dist/contractors/admin.html','dist/contractors/admin/opportunities.html']){let html=fs.readFileSync(file,'utf8');if(preview)html=html.replace('<div class="toolbar">','<div class="toolbar"><a class="button secondary" href="/preview/orders">Order automation lab</a>');fs.writeFileSync(file,html);}

const dynamic=new Set(['/admin/catalog','/admin/orders','/contractors/admin/zoom','/solutions/zoom','/solutions/zoom/quote']);
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
