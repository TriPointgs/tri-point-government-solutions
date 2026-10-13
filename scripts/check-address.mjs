import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {BUSINESS_ADDRESS_TEXT} from '../lib/business-address.mjs';
import {renderZoomPage} from '../lib/zoom-pages.mjs';

const required=['index.html','contractors.html','contractors/join.html','contractors/admin.html','login.html','solutions/lenovo.html'];
for(const file of required){
 const html=readFileSync('dist/'+file,'utf8');
 assert.ok(html.includes(BUSINESS_ADDRESS_TEXT),'Missing public company address in '+file);
 assert.ok(html.includes('Business address:'),'Missing explanatory label in '+file);
 assert.equal((html.match(/<h1\b/g)||[]).length,1,'Broken main page heading in '+file);
}
const home=readFileSync('dist/index.html','utf8');
assert.match(home,/"streetAddress":"1017 Cottonwood Street"/);
assert.match(home,/"addressLocality":"Leesburg"/);
assert.match(home,/"postalCode":"34748"/);
assert.match(renderZoomPage({review:true}),/noindex, nofollow/);
assert.doesNotMatch(readFileSync('dist/sitemap.xml','utf8'),/\/solutions\/zoom/);
console.log('HP public-address gate passed: homepage, contact, footer, network, Lenovo and SEO address. Zoom release remains held.');
