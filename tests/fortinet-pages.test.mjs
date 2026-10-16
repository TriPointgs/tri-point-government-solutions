import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FORTINET_ROUTE,FORTINET_BADGE,FORTINET_BADGE_LINED,fortinetBadge,injectFortinetHome,renderFortinetPage} from '../lib/fortinet-pages.mjs';
const art1=readFileSync(new URL('../assets/fortinet-advocate-partner.webp',import.meta.url));
const art2=readFileSync(new URL('../assets/fortinet-advocate-partner-lined.webp',import.meta.url));
test('both supplied Fortinet badge variants are actual optimized image files',()=>{
 for(const art of [art1,art2]){
  assert.equal(art.toString('ascii',0,4),'RIFF');
  assert.equal(art.toString('ascii',8,12),'WEBP');
  assert.ok(art.length>4000);
 }
 assert.notEqual(art1.toString('base64'),art2.toString('base64'));
});
test('homepage shows Advocate level independent of existing Lenovo badge',()=>{
 const input='<html><head></head><body><section id="lenovo-solutions"></section><section id="contact"></section></body></html>';
 const result=injectFortinetHome(input);
 assert.match(result,/id="lenovo-solutions"/);
 assert.match(result,/id="fortinet-solutions"/);
 assert.match(result,/Fortinet Engage Advocate Partner/);
 assert.match(result,/href="\/solutions\/fortinet"/);
 assert.match(result,/fortinet.css/);
 assert.throws(()=>injectFortinetHome(result),/duplicated/);
});
test('marketing page uses only the grounded tier and the supplied second badge',()=>{
 const p=renderFortinetPage();
 assert.match(p,/Fortinet Engage Advocate Partner/);
 assert.ok(p.includes(FORTINET_BADGE_LINED));
 assert.equal((p.match(/<h1\b/g)||[]).length,1);
 assert.match(p,/mailto:info@tripointgs.com/);
 assert.match(p,/independent reseller/);
 assert.doesNotMatch(p,/Fortinet Engage (?:Advanced|Expert|Select|Advanced-Expert) Partner/);
 assert.doesNotMatch(p,/guaranteed price|instant order|Fortinet authorized managed services/i);
 assert.match(p,/1017 Cottonwood Street/);
});
test('preview is noindex and production is indexable',()=>{
 assert.match(renderFortinetPage({preview:true}),/noindex, nofollow/);
 assert.match(renderFortinetPage({preview:false}),/index, follow/);
 assert.ok(fortinetBadge().includes(FORTINET_BADGE));
 assert.equal(FORTINET_ROUTE,'/solutions/fortinet');
});
