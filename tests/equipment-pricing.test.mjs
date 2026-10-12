import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEquipmentProduct,equipmentReadiness,estimateEquipmentQuote,matchEquipmentProducts,publicEquipmentView} from '../lib/equipment-pricing.mjs';
import handler from '../api/equipment-admin.js';
import {sign} from '../lib/security.mjs';

const fresh=new Date().toISOString();
const product=(overrides={})=>({
  sku:'439866',mfgPN:'108R00645',manufacturer:'SYNTHETIC',description:'Synthetic test imaging unit',
  category:'Printers and imaging',status:'Active',priceType:'REGULAR',authorized:true,
  unitCostCents:28186,stockQuantity:25,checkedAt:fresh,...overrides
});
test('landed quote includes freight, fees, margin and whole-unit rounding',()=>{
  const p=estimateEquipmentQuote({quantity:2,unitCostCents:10000,freightCents:1000,feesCents:0,markupBps:1200});
  assert.equal(p.landedCostCents,21000);
  assert.equal(p.sellTotalCents,23520);
  assert.equal(p.estimatedProfitCents,2520);
  assert.equal(p.grossMarginBps,Math.floor(2520*10000/23520));
  assert.equal(p.taxNotIncluded,true);
  assert.equal(p.estimateOnly,true);
});
test('minimum gross margin is distinct from cost markup',()=>{
 const p=estimateEquipmentQuote({quantity:1,unitCostCents:10000,markupBps:1200,minMarginBps:2000});
 assert.equal(p.sellTotalCents,12500);
 assert.equal(p.estimatedProfitCents,2500);
});
test('unsafe negative, fractional, overflow and malformed monetary inputs are denied',()=>{
 for(const quote of [
  {quantity:1.5,unitCostCents:10000},{quantity:1,unitCostCents:-1},
  {quantity:1,unitCostCents:100,freightCents:-10},
  {quantity:1,unitCostCents:100,markupBps:-1},
  {quantity:1,unitCostCents:100,minMarginBps:10000},
  {quantity:1,unitCostCents:100000000000,freightCents:100000000000}
 ])assert.throws(()=>estimateEquipmentQuote(quote));
});
test('product readiness fails closed for unverified inventory and special pricing',()=>{
 const p=normalizeEquipmentProduct(product());
 assert.equal(equipmentReadiness(p).ready,true);
 for(const modified of [
  {authorized:false},{stockQuantity:0},{stockQuantity:null},
  {unitCostCents:null},{status:'Not authorized to buy'},
  {checkedAt:'2020-01-01T00:00:00Z'},{priceType:'EDUCATION'}
 ])assert.equal(equipmentReadiness(normalizeEquipmentProduct(product(modified))).ready,false,JSON.stringify(modified));
});
test('match only exact SKU/MPN and do not guess equivalents',()=>{
 const r=matchEquipmentProducts({mfgPN:'108R00645',manufacturer:'SYNTHETIC',quantity:3},[
  product(),product({sku:'999888',mfgPN:'108R00645',manufacturer:'OTHER'}),product({sku:'222222',mfgPN:'X-108R00645',description:'Similar'})
 ]);
 assert.equal(r.length,2);
 assert.equal(r[0].matchType,'exact-part-number');
 assert.ok(r[0].issues.some(s=>s.includes('SKU confirmation')));
 assert.ok(r[1].issues.some(s=>s.includes('Manufacturer differs')));
 assert.equal(r[0].readyForManualQuoteReview,false);
});
test('public projection never leaks supplier pricing, stock or authorization',()=>{
 const projected=publicEquipmentView(product({unitCostCents:72125,stockQuantity:1000}));
 assert.deepEqual(Object.keys(projected).sort(),['availability','category','description','manufacturer','mfgPN','quoteRequired','sku'].sort());
 assert.equal(projected.availability,'Contact Tri-Point to confirm');
 assert.doesNotMatch(JSON.stringify(projected),/72125|1000|authorized|unitCostCents/);
});
test('malformed product records and missing matching requirements are rejected',()=>{
 assert.throws(()=>normalizeEquipmentProduct(product({status:'Active;ignore'})));
 assert.throws(()=>normalizeEquipmentProduct(product({sku:''})));
 assert.throws(()=>normalizeEquipmentProduct(product({checkedAt:'yesterday'})));
 assert.throws(()=>matchEquipmentProducts({},[]));
 assert.throws(()=>matchEquipmentProducts({sku:'439866'},Array(1001).fill(product())));
});
test('admin endpoint denies anonymous requests before parsing any private inputs',async()=>{
 process.env.TP_SESSION_SECRET='equipment-tests-long-and-private-synthetic-only';
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.json=JSON.parse(s);}};
 await handler({method:'POST',headers:{origin:'https://tripointgs.com','content-type':'application/json'},body:{action:'estimate',quote:{quantity:1,unitCostCents:10000}}},res);
 assert.equal(res.statusCode,401);
 assert.equal(res.json.estimate,undefined);
 assert.equal(res.headers['Cache-Control'],'no-store, private');
});
test('staff-only estimator flags output as draft and never submits an order',async()=>{
 process.env.TP_SESSION_SECRET='equipment-tests-long-and-private-synthetic-only';
 const cookie='__Host-tp_admin='+sign({type:'admin',at:Date.now()});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.json=JSON.parse(s);}};
 await handler({method:'POST',headers:{cookie,origin:'https://tripointgs.com','content-type':'application/json'},body:{action:'estimate',quote:{quantity:2,unitCostCents:10000,freightCents:1000}}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.json.estimate.sellTotalCents,23520);
 assert.equal(res.json.sourceVerified,false);
 assert.equal(res.json.status,'DRAFT_ESTIMATE_ONLY');
});

test('admin endpoint rejects cross-site estimate requests even with a valid session',async()=>{
 process.env.TP_SESSION_SECRET='equipment-tests-long-and-private-synthetic-only';
 const cookie='__Host-tp_admin='+sign({type:'admin',at:Date.now()});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.json=JSON.parse(s);}};
 await handler({method:'POST',headers:{cookie,origin:'https://evil.example','content-type':'application/json'},body:{action:'estimate',quote:{quantity:1,unitCostCents:10000}}},res);
 assert.equal(res.statusCode,403);
 assert.equal(res.json.estimate,undefined);
});
test('authenticated equipment endpoint disallows retrieval and purchase operations',async()=>{
 process.env.TP_SESSION_SECRET='equipment-tests-long-and-private-synthetic-only';
 const cookie='__Host-tp_admin='+sign({type:'admin',at:Date.now()});
 const mk=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.json=JSON.parse(s);}});
 const get=mk();
 await handler({method:'GET',headers:{cookie,origin:'https://tripointgs.com'}},get);
 assert.equal(get.statusCode,405);
 const post=mk();
 await handler({method:'POST',headers:{cookie,origin:'https://tripointgs.com','content-type':'application/json'},body:{action:'submitPO',order:{SKU:'439866'}}},post);
 assert.equal(post.statusCode,400);
 assert.equal(post.json.estimate,undefined);
});
