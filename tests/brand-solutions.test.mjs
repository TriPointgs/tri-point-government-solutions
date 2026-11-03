import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {brandSolutionsPage} from '../lib/brand-solutions-page.mjs';
for(const brand of ['wasabi','ptzoptics']){
 const data=JSON.parse(fs.readFileSync(`content/${brand}/catalog.json`,'utf8'));
 test(`${brand}: every product has a unique anchor, local image, description and traceable source`,()=>{
  const ids=new Set();assert.ok(data.products.length>10);
  for(const p of data.products){assert.match(p.id,/^[a-z0-9-]+$/);assert.ok(!ids.has(p.id));ids.add(p.id);assert.ok(p.description.length>=40,p.id);assert.ok(p.source,p.id);assert.match(p.image,new RegExp('^/assets/brands/'+brand+'/[a-z0-9.-]+$'));assert.ok(fs.statSync('.'+p.image).size>100,p.id);assert.ok(p.imageAlt.length>10);assert.match(p.manufacturerUrl,/^https:\/\/(?:[a-z0-9-]+\.)*(?:wasabi\.com|ptzoptics\.com|huddlecamhd\.com)(?:\/|$)/);}
 });
 test(`${brand}: complete content works without script and avoids checkout activation`,()=>{
  const html=brandSolutionsPage(brand,data);assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.equal((html.match(/data-product-card /g)||[]).length,data.products.length);assert.match(html,/noindex, follow/);assert.match(html,/id="main"/);assert.match(html,/id="brand-search"/);assert.match(html,/id="brand-compare-dialog"/);assert.doesNotMatch(html,/Buy now|api\/stripe|checkout-session|payment_intent|TP_.*SECRET/);for(const p of data.products){assert.ok(html.includes(`id="${p.id}"`));assert.ok([...html.matchAll(/href="(\/contact[^"]*)"/g)].some(m=>new URL(m[1].replaceAll('&amp;','&'),'https://example.invalid').searchParams.get('product')===p.name),p.name);}
 });
}
test('catalog renderer escapes supplied text and query values',()=>{
 const html=brandSolutionsPage('wasabi',{heroImage:'/assets/test.webp',products:[{id:'test',name:'<script>alert(1)</script>',description:'<img onerror=alert(1)>',category:'object-storage',features:[],variants:[],image:'/assets/test.webp',imageAlt:'<svg onload=alert(1)>',manufacturerUrl:'https://wasabi.com/'}]});assert.doesNotMatch(html,/<script>alert|<img onerror|<svg onload/);assert.match(html,/&lt;script&gt;/);
});
