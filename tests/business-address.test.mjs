import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUSINESS_ADDRESS, BUSINESS_ADDRESS_TEXT, BUSINESS_ADDRESS_HTML, BUSINESS_POSTAL_ADDRESS} from '../lib/business-address.mjs';
import {renderLenovoPage} from '../lib/lenovo-pages.mjs';
import {renderZoomPage,renderZoomAdmin} from '../lib/zoom-pages.mjs';

test('HP-requested business address matches the explicitly approved public spelling',()=>{
 assert.equal(BUSINESS_ADDRESS_TEXT,'1017 Cottonwood Street, Leesburg, FL 34748');
 assert.deepEqual(BUSINESS_ADDRESS,{streetAddress:'1017 Cottonwood Street',addressLocality:'Leesburg',addressRegion:'FL',postalCode:'34748',addressCountry:'US'});
 assert.equal(BUSINESS_POSTAL_ADDRESS['@type'],'PostalAddress');
});
test('network and agency main page expose the business address without a login',()=>{
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(home,/<section id="contact"/);
 assert.match(home,/Business address:<\/strong> <span>1017 Cottonwood Street, Leesburg, FL 34748<\/span>/);
 assert.match(home,/<footer>[\s\S]*1017 Cottonwood Street, Leesburg, FL 34748/);
 assert.match(BUSINESS_ADDRESS_HTML,/<address[^>]*>1017 Cottonwood Street, Leesburg, FL 34748<\/address>/);
});
test('Lenovo sourcing page includes matching contact address',()=>{
 const html=renderLenovoPage({preview:false});
 assert.ok(html.includes(BUSINESS_ADDRESS_HTML));
 assert.match(html,/"streetAddress":"1017 Cottonwood Street"/);
 assert.match(html,/Lenovo 360 Authorized 2026/);
});
test('staff-only Zoom draft has the same address while remaining gated',()=>{
 for(const html of [renderZoomPage({review:true}),renderZoomAdmin()])assert.ok(html.includes(BUSINESS_ADDRESS_HTML));
 assert.match(renderZoomPage({review:true}),/name="robots" content="noindex, nofollow"/);
});
