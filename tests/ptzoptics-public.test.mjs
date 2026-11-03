import test from 'node:test';import assert from 'node:assert/strict';
import {ptzopticsPage} from '../lib/ptzoptics-page.mjs';
import {siteHeader,siteFooter} from '../lib/site-experience.mjs';
test('new public PTZOptics stage fits existing visual system and route',()=>{
 const page=ptzopticsPage();
 for(const marker of ['PTZOptics Cameras, Controllers & Production Tools','data-product-card','id="portfolio"','/assets/brand-solutions.css','experience-header','experience-footer'])assert.ok(page.includes(marker),marker);
 assert.match(page,/robots" content="noindex, follow"/);
 assert.doesNotMatch(page,/Add to cart|Pay now|Buy now|SubmitPO|official distributor|authorized reseller|\$[0-9]/i);
});
test('PTZOptics is discoverable via navigation and footer without suggesting confirmed reseller authorization',()=>{
 const h=siteHeader('/solutions/ptzoptics'),f=siteFooter({route:'/solutions/ptzoptics'});
 assert.match(h,/Technology solutions/);
 assert.match(h,/href="\/solutions\/ptzoptics"/);
 assert.match(f,/href="\/solutions\/ptzoptics"/);
 assert.doesNotMatch(h,/PTZOptics authorized|PTZOptics official/i);
});
