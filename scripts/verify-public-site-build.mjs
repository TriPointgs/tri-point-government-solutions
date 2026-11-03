import assert from 'node:assert/strict';import fs from 'node:fs';
for(const p of ['dist/index.html','dist/marketplace.html','dist/contact.html','dist/contractors.html','dist/privacy.html'])assert.ok(fs.existsSync(p),`missing ${p}`);
const market=fs.readFileSync('dist/marketplace.html','utf8'),home=fs.readFileSync('dist/index.html','utf8'),contact=fs.readFileSync('dist/contact.html','utf8');
assert.match(market,/Find what fits/);assert.match(market,/id="quote-picker"/);assert.match(market,/id="quote-continue"/);assert.match(market,/contact\?fromList=1/);
assert.doesNotMatch(market,/checkout.stripe.com|Add to cart|Pay now|Buy now|SubmitPO|data-product-price|cart-action|stripe-test/);
assert.match(home,/Technology that moves/);assert.match(home,/Browse the marketplace/);assert.doesNotMatch(home,/Marketplace coming soon/);
for(const id of ['capabilities','contracting'])assert.ok(home.includes(`id="${id}"`));
assert.match(contact,/id="contact-form"/);assert.match(contact,/name="manufacturers"/);assert.match(contact,/name="interests"/);assert.match(contact,/id="contact-submit"/);assert.match(contact,/src="\/assets\/contact.js"/);
assert.match(contact,/id="brand-inquiry-selection"/);assert.match(contact,/privacy#website-inquiries/);assert.match(fs.readFileSync('dist/privacy.html','utf8'),/id="website-inquiries"/);
const options=JSON.parse(fs.readFileSync('dist/assets/quote-options.json','utf8'));assert.ok(options.length>40);assert.ok(options.every(o=>o.image.startsWith('/assets/')&&!o.manufacturerUrl));
for(const p of ['dist/assets/quote-selection.js','dist/assets/quote-marketplace.js','dist/assets/contact.css','dist/assets/contact-admin.js','dist/assets/experience.js'])assert.ok(fs.existsSync(p));
for(const brand of ['ptzoptics','wasabi']){const html=fs.readFileSync('dist/solutions/'+brand+'.html','utf8');assert.match(html,/data-product-card/);assert.match(html,/id="portfolio"/);assert.match(html,/id="brand-compare-dialog"/);assert.doesNotMatch(html,/Add to cart|Buy now|SubmitPO|authorized reseller/i);assert.ok(home.includes('href="/solutions/'+brand+'"'));assert.match(html,/href="\/contact\?manufacturer=/);}
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.ok(config.rewrites.some(r=>r.source==='/api/contact'&&r.destination==='/api/intake?channel=quote'));assert.ok(config.rewrites.some(r=>r.source==='/admin/inquiries'&&r.destination.includes('view=admin-page')));
assert.equal(fs.readdirSync('api').filter(p=>p.endsWith('.js')).length,12,'Retain the existing serverless function count');
console.log('PASS quote marketplace, multi-item request form, privacy, routing and inactive checkout boundary checks');
