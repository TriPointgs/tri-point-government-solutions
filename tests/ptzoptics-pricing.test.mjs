import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ptzopticsPage} from '../lib/ptzoptics-page.mjs';
import {catalogQuoteOptions, modelQuoteName, formatCatalogPrice, pricedModels} from '../lib/catalog-pricing.mjs';
const catalog=JSON.parse(fs.readFileSync('content/ptzoptics/catalog.json','utf8'));
const rows=catalog.products.flatMap(product=>pricedModels(product));

test('November price card includes 91 unique, positive customer prices with the approved fallback',()=>{
 assert.equal(rows.length,91);
 assert.equal(new Set(rows.map(row=>row.sku)).size,91);
 assert.equal(catalog.pricingUpdatedAt,'2026-11-24');
 assert.equal(catalog.pricingCurrency,'USD');
 assert.equal(rows.filter(row=>row.priceBasis==='MAP').length,89);
 assert.deepEqual(rows.filter(row=>row.priceBasis==='MSRP'),[{sku:'PT-WEBCAM-80-V2',price:42,priceBasis:'MSRP'},{sku:'HC10XA-WH',price:659,priceBasis:'MSRP'}]);
 for(const row of rows)assert.deepEqual(Object.keys(row).sort(),['price','priceBasis','sku']);
 assert.equal(rows.find(row=>row.sku==='PT30X4K-PRODUCER-SJOY').price,8732);
 assert.equal(rows.find(row=>row.sku==='PT12X-STUDIO-4K-GY-G3TAA').price,1369);
 assert.throws(()=>pricedModels({id:'bad',pricedModels:[{sku:'X',price:0,priceBasis:'MAP'}]}));
});

test('every priced model is searchable, rendered without JavaScript and linked to an exact-model quote',()=>{
 const html=ptzopticsPage();
 const options=catalogQuoteOptions(catalog,'ptzoptics');
 assert.equal((html.match(/data-priced-sku=/g)||[]).length,91);
 assert.match(html,/91 models with published prices/);
 assert.match(html,/November 24, 2026/);
 assert.match(html,/\$569.00 \/ year/);
 assert.match(html,/\$1,515.00 \/ year/);
 assert.match(html,/\$3,000.00 \/ year/);
 for(const product of catalog.products){
  for(const row of pricedModels(product)){
   assert.ok(product.variants.includes(row.sku));
   assert.ok(html.includes(`data-priced-sku="${row.sku}"`));
   assert.ok(html.includes(formatCatalogPrice(row.price)));
   const name=modelQuoteName(product,row);
   const query=new URLSearchParams({manufacturer:'PTZOptics',product:name});
   assert.ok(html.includes('/contact?'+query.toString().replaceAll('&','&amp;')),row.sku);
   const option=options.find(option=>option.name===name);
   assert.ok(option,row.sku);
   assert.ok(option.description.length<=160);
   assert.equal(option.brand,'PTZOptics');
  }
 }
 assert.doesNotMatch(html,/TAA Compliant|IEC Compliant|Reg_Prc|Net_Prc|GovEd|TotAv|Country of Origin|dealer cost|in stock/i);
 assert.doesNotMatch(JSON.stringify(catalog),/Reg_Prc|Net_Prc|GovEd|TotAv|Ptzoptics_20261124_124559|assetserver/);
});
