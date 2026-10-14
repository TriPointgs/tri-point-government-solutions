// Additive post-build integration: legacy public boundaries and contractor output remain intact.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {ZOOM_ORG_TYPES,ZOOM_PRODUCTS,ZOOM_REQUEST_TYPES,ZOOM_STATUSES} from '../lib/zoom-model.mjs';
import {zoomPublicEnabled} from '../lib/zoom-release.mjs';
fs.writeFileSync('dist/assets/zoom-fields.mjs','export const ZOOM_FIELDS='+JSON.stringify({organizationTypes:ZOOM_ORG_TYPES,products:ZOOM_PRODUCTS,requestTypes:ZOOM_REQUEST_TYPES,statuses:ZOOM_STATUSES})+';\n');
for(const file of ['dist/contractors/admin.html','dist/contractors/admin/opportunities.html']){
 let html=fs.readFileSync(file,'utf8');const marker='<div class="toolbar">';assert.ok(html.includes(marker),'Private navigation integration point changed.');html=html.replace(marker,marker+'<a class="button secondary" href="/contractors/admin/zoom">Zoom Sales Leads</a>');fs.writeFileSync(file,html);
}
// Marketing HTML must only be produced after server-side access approval, never as a static asset.
for(const p of ['dist/solutions/zoom','dist/solutions/zoom.html','dist/contractors/admin/zoom.html'])fs.rmSync(p,{force:true,recursive:true});
const sitemap='dist/sitemap.xml';let xml=fs.readFileSync(sitemap,'utf8');
if(zoomPublicEnabled()){xml=xml.replace('</urlset>','<url><loc>https://tripointgs.com/solutions/zoom</loc></url></urlset>');fs.writeFileSync(sitemap,xml);}
else assert.doesNotMatch(xml,/\/solutions\/zoom/);
const dynamic=new Set(['/admin/catalog','/contractors/admin/zoom','/solutions/zoom','/solutions/zoom/quote']);
const pages=fs.readdirSync('dist',{recursive:true}).filter(p=>p.endsWith('.html'));
for(const p of pages){const h=fs.readFileSync('dist/'+p,'utf8');if(!p.startsWith('contractors/admin')&&!zoomPublicEnabled())assert.doesNotMatch(h,/href="\/solutions\/zoom/,'Unapproved marketing navigation must not be public');for(const m of h.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){const v=m[1];if(v.startsWith('/api/')||dynamic.has(v))continue;assert.ok(fs.existsSync('dist'+(v==='/'?'/index.html':v))||fs.existsSync('dist'+v+'.html'),'Missing link target: '+v);}}
console.log('Zoom release gate PASS: server-only draft, no public marketing navigation/sitemap, isolated private admin integration.');
