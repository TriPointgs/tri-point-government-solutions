import fs from 'node:fs';import assert from 'node:assert/strict';
import {LENOVO_ROUTE,LENOVO_BADGE,injectLenovoHome,renderLenovoPage} from '../lib/lenovo-pages.mjs';
const dist='dist',badgeFile=dist+LENOVO_BADGE;
assert.ok(fs.existsSync(badgeFile),'Lenovo emblem must be included as an actual artwork file.');
const binary=fs.readFileSync(badgeFile);
assert.equal(binary.toString('ascii',0,4),'RIFF');
assert.equal(binary.toString('ascii',8,12),'WEBP');
assert.ok(binary.byteLength>3000&&binary.byteLength<100000);
const homeFile=dist+'/index.html';
fs.writeFileSync(homeFile,injectLenovoHome(fs.readFileSync(homeFile,'utf8')));
fs.mkdirSync(dist+'/solutions',{recursive:true});
fs.writeFileSync(dist+LENOVO_ROUTE+'.html',renderLenovoPage({preview:process.env.VERCEL_ENV!=='production'}));
const siteMap=dist+'/sitemap.xml';let xml=fs.readFileSync(siteMap,'utf8');
assert.ok(!xml.includes(LENOVO_ROUTE));
if(process.env.VERCEL_ENV==='production'){xml=xml.replace('</urlset>','<url><loc>https://tripointgs.com'+LENOVO_ROUTE+'</loc></url></urlset>');fs.writeFileSync(siteMap,xml);}
assert.doesNotMatch(fs.readFileSync(homeFile,'utf8'),/href="\/solutions\/zoom"/,'Unapproved Zoom marketing must stay gated');
for(const p of ['dist/index.html','dist'+LENOVO_ROUTE+'.html'])assert.equal((fs.readFileSync(p,'utf8').match(/<h1\b/g)||[]).length,1);
console.log('Lenovo badge artwork and independently branded procurement page passed build gate.');
