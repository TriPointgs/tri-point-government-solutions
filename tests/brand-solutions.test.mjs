import {createHash} from 'node:crypto';
import {arcticWolfPage} from '../lib/arctic-wolf-page.mjs';
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
  const html=brandSolutionsPage(brand,data);assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.equal((html.match(/data-product-card /g)||[]).length,data.products.length);assert.match(html,/noindex, follow/);assert.doesNotMatch(html,/<a\b[^>]*href="https?:\/\//i);assert.doesNotMatch(html,/Manufacturer information/);assert.match(html,/Contact us for a quote/);assert.match(html,/id="main"/);assert.match(html,/id="brand-search"/);assert.match(html,/id="brand-compare-dialog"/);assert.doesNotMatch(html,/Buy now|api\/stripe|checkout-session|payment_intent|TP_.*SECRET/);for(const p of data.products){assert.ok(html.includes(`id="${p.id}"`));assert.ok([...html.matchAll(/href="(\/contact[^"]*)"/g)].some(m=>new URL(m[1].replaceAll('&amp;','&'),'https://example.invalid').searchParams.get('product')===p.name),p.name);}
 });
}
test('catalog renderer escapes supplied text and query values',()=>{
 const html=brandSolutionsPage('wasabi',{heroImage:'/assets/test.webp',products:[{id:'test',name:'<script>alert(1)</script>',description:'<img onerror=alert(1)>',category:'object-storage',features:[],variants:[],image:'/assets/test.webp',imageAlt:'<svg onload=alert(1)>',manufacturerUrl:'https://wasabi.com/'}]});assert.doesNotMatch(html,/<script>alert|<img onerror|<svg onload/);assert.match(html,/&lt;script&gt;/);
});

test('Arctic Wolf renders six sourced service inquiries with the intact Bronze artwork',()=>{
 const catalog=JSON.parse(fs.readFileSync('content/arctic-wolf/catalog.json','utf8'));
 const html=arcticWolfPage();
 const links=[...html.matchAll(/href="(\/contact[^"]+)"/g)].map(match=>new URL(match[1].replaceAll('&amp;','&'),'https://example.invalid'));
 const ids=new Set(catalog.products.map(service=>service.id));
 assert.equal(ids.size,6);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.equal((html.match(/data-product-card /g)||[]).length,6);
 assert.match(html,/<meta name="robots" content="noindex, follow">/);
 assert.match(html,/alt="Arctic Wolf Bronze Pack Partner"/);
 assert.doesNotMatch(html,/data-compare|brand-compare-dialog|Buy now|checkout-session|payment_intent|EMEA Bronze|Gold Pack Partner|Silver Pack Partner/);
 const badge=fs.readFileSync('.'+catalog.partnerBadge);
 assert.equal(createHash('sha256').update(badge).digest('hex'),'77652f72a0367a4d385366bccd107e5a4cc267d4ccdb8f8057a2b2d1805f0a24');
 for(const service of catalog.products){
  assert.equal(service.offeringType,'service-family');
  assert.deepEqual(service.variants,[]);
  assert.equal(service.manufacturerUrl,service.source.url);
  assert.match(service.source.checkedOn,/^\d{4}-\d{2}-\d{2}$/);
  assert.match(service.manufacturerUrl,/^https:\/\/(?:docs\.)?arcticwolf\.com\//);
  assert.ok(service.imageAlt.length>10&&fs.statSync('.'+service.image).size>100);
  assert.ok(links.some(url=>url.searchParams.get('manufacturer')==='Arctic Wolf'&&url.searchParams.get('product')===service.name),service.name);
 }
});
