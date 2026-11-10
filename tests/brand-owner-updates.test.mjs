import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {siteHeader} from '../lib/site-experience.mjs';import {brandHomeBadges,injectBrandHomeBadges} from '../lib/brand-home.mjs';import {brandSolutionsPage} from '../lib/brand-solutions-page.mjs';
import {injectArcticWolfHome} from '../lib/arctic-wolf-page.mjs';
test('public banner uses the exact owner-supplied transparent logo',()=>{const bytes=fs.readFileSync('assets/tripoint-header-logo.png');assert.equal(createHash('sha256').update(bytes).digest('hex'),'3a7dfe145100cc2b225add43283c9fafb8c585a23367814c779b0aca85c0bc5b');assert.equal(bytes.readUInt32BE(16),3280);assert.equal(bytes.readUInt32BE(20),664);const h=siteHeader();assert.match(h,/src="\/assets\/tripoint-header-logo.png"/);assert.doesNotMatch(h,/src="\/assets\/tripoint-logo.svg"/);});
test('homepage badges identify all requested brands and retain Tri-Point contact/navigation',()=>{const html=brandHomeBadges();for(const id of ['zoom','ptzoptics','wasabi']){assert.ok(html.includes(`data-home-brand="${id}"`));}assert.match(html,/\/contact\?manufacturer=Zoom/);assert.match(html,/href="\/solutions\/wasabi"/);assert.match(html,/href="\/solutions\/ptzoptics"/);assert.doesNotMatch(html,/href="https?:\/\/|Zoom Up|authorized reseller|certified partner/i);const input='<html><head></head><body><main><section class="section" id="lenovo-solutions"></section></main></body></html>';const result=injectBrandHomeBadges(input);assert.equal((result.match(/id="technology-brands"/g)||[]).length,1);assert.match(result,/brand-home.css/);assert.throws(()=>injectBrandHomeBadges(result));});
test('Arctic Wolf appears in the home-page body with its standalone Bronze badge',()=>{
 const input='<html><head></head><body><main><section id="fortinet-solutions"></section><section id="contact"></section></main></body></html>';
 const result=injectArcticWolfHome(input);
 assert.match(result,/id="fortinet-solutions"[\s\S]+id="arctic-wolf-solutions"[\s\S]+id="contact"/);
 assert.match(result,/href="\/solutions\/arctic-wolf">Explore Arctic Wolf solutions<\/a>/);
 assert.match(result,/src="\/assets\/brands\/arctic-wolf\/bronze-pack-partner\.png" alt="Arctic Wolf Bronze Pack Partner"/);
 assert.match(result,/href="\/assets\/brands\/arctic-wolf\/home\.css"/);
 assert.throws(()=>injectArcticWolfHome(result));
});
test('houses of worship has its own PTZOptics application card',()=>{const d=JSON.parse(fs.readFileSync('content/ptzoptics/catalog.json','utf8'));const html=brandSolutionsPage('ptzoptics',d);assert.match(html,/<h3>Houses of worship<\/h3>/);assert.match(html,/services, sermons, and worship gatherings/);assert.match(html,/volunteer-friendly control/);});
