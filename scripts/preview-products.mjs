import {createShopHandler} from '../api/shop.js';
import {createShopService} from '../lib/shop-cart-service.mjs';
import {memoryCartStore} from '../lib/shop-cart-store.mjs';
import {memorySmartStore} from '../lib/smart-pricing-store.mjs';
import {memoryResearchStore} from '../lib/research-report-store.mjs';
import {normalizeShopping,normalizeExactWebListings} from '../lib/serpapi-shopping.mjs';
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
const td={configuration:()=>({enabled:true,environment:'production',currencyConfirmed:false,readOnly:true,maximumBatch:100,missing:[]}),lookup:async selectors=>normalizeTdResponse({PriceAvailabilityList:selectors.map((s,index)=>{
 const i=raw.find(x=>x.distributorId===s.sku),n=Number(s.sku)-90000000,status=n%13===0?'Not authorized':n%17===0?'Discontinued':'Active',quantity=n%7===0?0:10+n;
 return {lineNumber:index+1,synnexSKU:Number(s.sku),mfgPN:i.mfgPart,status,GlobalProductStatusCode:status,price:n%11===0?null:String(100+10*n)+'.00',priceType:'REGULAR',totalQuantity:quantity,EURequired:'N',parcelShippable:'Y',AvailabilityByWarehouse:[{warehouseInfo:{number:3,city:'SYNTHETIC'},qty:quantity}]};})},selectors,{environment:'production',checkedAt:new Date(Date.now()-2*3600000).toISOString(),currencyConfirmed:false})};
const env={VERCEL_ENV:'preview',TP_CATALOG_API_URL:'https://synthetic.invalid',TP_CATALOG_API_TOKEN:'synthetic-token-not-a-live-credential-0000'};
const store=memoryProductStore();const service=createProductControls({env,store,catalog,td,marketStore:memoryMarketPriceStore(),smartStore:memorySmartStore(),researchStore:memoryResearchStore(),shopping:{status:()=>({configured:true,previewOnly:true,manualTriggerOnly:true,queriesPerTrigger:1}),search:async (product,{mode='shopping'}={})=>mode==='exact_web'?normalizeExactWebListings({search_metadata:{status:'Success'},organic_results:[{title:'Synthetic Staples laptop '+product.mfgPart,link:'https://www.staples.com/product_'+product.mfgPart,snippet:'Synthetic only '+product.mfgPart+'; price $1,551.00 Backorder Stock: 0'},{title:'Synthetic Newegg laptop '+product.mfgPart,link:'https://www.newegg.com/synthetic/p/1234',snippet:'Exact MPN '+product.mfgPart+'; price $1,549.00. Available to order. Supplied to order'},{title:'Unrelated notebook',link:'https://www.example.org/not-allowed',snippet:'Other model'}]},product,{checkedAt:new Date().toISOString()}):normalizeShopping({shopping_results:[{title:product.description+' '+product.mfgPart,source:'Synthetic Newegg',price:'$129.00',extracted_price:129,product_link:'https://www.google.com/shopping/product/111'},{title:product.description+' '+product.mfgPart,source:'Synthetic Walmart',price:'$139.00',extracted_price:139,product_link:'https://www.google.com/shopping/product/222'},{title:'Other configuration',source:'Synthetic Example',price:'$119.00',extracted_price:119,product_link:'https://www.google.com/shopping/product/333'}]},product,{checkedAt:new Date().toISOString()})},sourceLabel:'synthetic-local-fixture'});
export const previewProductControls=createProductControlsHandler({env,service,rate:async()=>{}});

// Separate loopback shop fixture, with fresh USD observations. Never used in deployed routes.
const shoppingTd={configuration:()=>({enabled:true,environment:'production',currencyConfirmed:true}),lookup:async selectors=>normalizeTdResponse({PriceAvailabilityList:selectors.map((s,index)=>{const i=raw.find(x=>x.distributorId===s.sku);const n=Number(s.sku)-90000000,quantity=n===7?0:250;return {lineNumber:index+1,synnexSKU:Number(s.sku),mfgPN:i.mfgPart,status:'Active',GlobalProductStatusCode:'Active',price:String(100+10*n)+'.00',priceType:'REGULAR',totalQuantity:quantity,weight:'4.5',EURequired:'N',parcelShippable:'Y',AvailabilityByWarehouse:[{warehouseInfo:{number:3,city:'SYNTHETIC'},qty:quantity}]};})},selectors,{environment:'production',checkedAt:new Date().toISOString(),currencyConfirmed:true}),freight:async ({zip,items})=>{const subtotal=items.reduce((n,x)=>n+(10000+(Number(x.sku)-90000000)*1000)*x.quantity,0),weight=items.reduce((n,x)=>n+4.5*x.quantity,0);return {source:'tdsynnex-freightquote',environment:'production',checkedAt:new Date().toISOString(),zip,currency:'USD',amountCents:subtotal>100000&&weight<100?0:1250,freightCents:subtotal>100000&&weight<100?0:1250,knownExtraChargesCents:0,extraChargesComplete:true,shipmentCount:1,shipments:[]};}};
export const previewShop=createShopHandler({env,service:createShopService({env,products:store,cartStore:memoryCartStore(),td:shoppingTd,catalog,settings:memorySmartStore(),marketStore:memoryMarketPriceStore()}),rate:async()=>{}});
