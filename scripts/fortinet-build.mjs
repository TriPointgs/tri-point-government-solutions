import fs from 'node:fs';
import assert from 'node:assert/strict';
import {FORTINET_ROUTE,FORTINET_BADGE,FORTINET_BADGE_LINED,injectFortinetHome,renderFortinetPage} from '../lib/fortinet-pages.mjs';
const dist='dist',preview=process.env.VERCEL_ENV!=='production';
for(const badge of [FORTINET_BADGE,FORTINET_BADGE_LINED]){
 const target=dist+badge;
 assert.ok(fs.existsSync(target),'Missing supplied Fortinet Advocate Partner artwork: '+badge);
 const bytes=fs.readFileSync(target);
 assert.equal(bytes.toString('ascii',0,4),'RIFF','Not a WebP image: '+badge);
 assert.equal(bytes.toString('ascii',8,12),'WEBP','Not a WebP image: '+badge);
 assert.ok(bytes.length>4000&&bytes.length<200000,'Unexpected Fortinet badge file size: '+badge);
}
const homepage=dist+'/index.html';
const html=injectFortinetHome(fs.readFileSync(homepage,'utf8'));
assert.match(html,/id="lenovo-solutions"/,'Existing Lenovo section must remain');
assert.match(html,/id="fortinet-solutions"/,'Fortinet badge section must be present');
assert.match(html,/Advocate Partner/,'Exact badge tier needs correct text');
assert.doesNotMatch(html,/Fortinet.*(?:Advanced Partner|Expert Partner|authorized managed security services)/i,'Do not claim a higher Fortinet partner level');
fs.writeFileSync(homepage,html);
fs.mkdirSync(dist+'/solutions',{recursive:true});
const page=renderFortinetPage({preview});
assert.match(page,/Fortinet Engage Advocate Partner/);
assert.equal((page.match(/<h1\b/g)||[]).length,1);
assert.doesNotMatch(page,/data:|onerror=|<script src=/);
fs.writeFileSync(dist+FORTINET_ROUTE+'.html',page);
let sitemap=fs.readFileSync(dist+'/sitemap.xml','utf8');
assert.ok(!sitemap.includes(FORTINET_ROUTE));
if(!preview){
 sitemap=sitemap.replace('</urlset>','<url><loc>https://tripointgs.com'+FORTINET_ROUTE+'</loc></url></urlset>');
 fs.writeFileSync(dist+'/sitemap.xml',sitemap);
}
console.log('Fortinet Engage Advocate Partner badges: both supplied variants verified; homepage and independent sourcing page generated.');
