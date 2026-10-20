import {normalizeShopping} from '../lib/serpapi-shopping.mjs';
import {memoryMarketPriceStore} from '../lib/market-price-store.mjs';
// Loopback-only fixtures. Do not import this module from a deployed route.
import {catalogQuery,sanitizeCatalog} from '../lib/catalog-remote.mjs';
import {createProductControls} from '../lib/product-controls-service.mjs';
import {memoryProductStore} from '../lib/product-controls-store.mjs';
import {normalizeTdResponse} from '../lib/tdsynnex-readonly.mjs';
import {createProductControlsHandler} from '../api/product-controls.js';
if(process.env.VERCEL||process.env.NODE_ENV!=='test')throw Error('Synthetic product fixtures are local-only.');
const raw=Array.from({length:65},(_,i)=>{
 const maker=i%5===0?'EXAMPLE ACCESSORIES':i%3===0?'FORTINET':'LENOVO';
 const category=maker==='EXAMPLE ACCESSORIES'?'accessories':maker==='FORTINET'?'networking':'laptops';
 return {manufacturer:maker,description:category==='accessories'?'SYNTHETIC ThinkPad replacement sleeve '+(i+1):category==='networking'?'SYNTHETIC network firewall '+(i+1):'SYNTHETIC ThinkPad business notebook '+(i+1),mfgPart:'SYNTHETIC-PART-'+(i+1),distributorId:String(90000000+i),supplierSku:'SYNTHETIC-'+i,productFamily:category.toUpperCase(),category,rawField13:999999,rawField14:999999,rawField10:999999,rawField11:999999};
});
const catalog=async q=>{
 const items=raw.filter(i=>(!q.q||(q.exact?[i.mfgPart,i.distributorId].includes(q.q.toUpperCase()):[i.description,i.mfgPart,i.distributorId].join(' ').toLowerCase().includes(q.q.toLowerCase())))&&(!q.maker||i.manufacturer.includes(q.maker.toUpperCase()))&&(q.category==='all'||i.category===q.category));
 return sanitizeCatalog({items:items.slice(q.page*50,q.page*50+50),hasMore:items.length>(q.page+1)*50,filterVersion:2,category:q.category,exact:q.exact,snapshotDate:'SYNTHETIC FIXTURE'},q);
};
const td={configuration:()=>({enabled:true,environment:'production',currencyConfirmed:true,readOnly:true,maximumBatch:100,missing:[]}),lookup:async selectors=>normalizeTdResponse({PriceAvailabilityList:selectors.map((s,index)=>{
 const i=raw.find(x=>x.distributorId===s.sku),n=Number(s.sku)-90000000,status=n%13===0?'Not authorized':n%17===0?'Discontinued':'Active',quantity=n%7===0?0:10+n;
 return {lineNumber:index+1,synnexSKU:Number(s.sku),mfgPN:i.mfgPart,status,GlobalProductStatusCode:status,price:n%11===0?null:String(100+10*n)+'.00',priceType:'REGULAR',totalQuantity:quantity,EURequired:'N',parcelShippable:'Y',AvailabilityByWarehouse:[{warehouseInfo:{number:3,city:'SYNTHETIC'},qty:quantity}]};})},selectors,{environment:'production',checkedAt:new Date().toISOString(),currencyConfirmed:true})};
const env={VERCEL_ENV:'preview',TP_CATALOG_API_URL:'https://synthetic.invalid',TP_CATALOG_API_TOKEN:'synthetic-token-not-a-live-credential-0000'};
const store=memoryProductStore();const service=createProductControls({env,store,catalog,td,marketStore:memoryMarketPriceStore(),shopping:{status:()=>({configured:true,previewOnly:true,manualTriggerOnly:true,queriesPerTrigger:1}),search:async product=>normalizeShopping({shopping_results:[{title:product.description+' '+product.mfgPart,source:'Synthetic Newegg',price:'$129.00',extracted_price:129,product_link:'https://www.google.com/shopping/product/111'},{title:product.description+' '+product.mfgPart,source:'Synthetic Walmart',price:'$139.00',extracted_price:139,product_link:'https://www.google.com/shopping/product/222'},{title:'Other configuration',source:'Synthetic Example',price:'$119.00',extracted_price:119,product_link:'https://www.google.com/shopping/product/333'}]},product,{checkedAt:new Date().toISOString()})},sourceLabel:'synthetic-local-fixture'});
export const previewProductControls=createProductControlsHandler({env,service,rate:async()=>{}});
