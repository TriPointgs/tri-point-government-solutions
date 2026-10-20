// Internal research evidence only: no retailer fetching, repricing, public savings claims or checkout.
import {HttpError} from './model.mjs';
export const MARKET_MAX_AGE_MS=24*60*60*1000;
export const RETAILERS=Object.freeze([
 {id:'newegg',name:'Newegg',host:'www.newegg.com',path:/\/p\//,search:p=>'https://www.newegg.com/p/pl?d='+encodeURIComponent(p)},
 {id:'walmart',name:'Walmart',host:'www.walmart.com',path:/^\/ip\//,search:p=>'https://www.walmart.com/search?q='+encodeURIComponent(p)},
 {id:'amazon',name:'Amazon',host:'www.amazon.com',path:/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i,search:p=>'https://www.amazon.com/s?k='+encodeURIComponent(p)},
 {id:'bh',name:'B&H',host:'www.bhphotovideo.com',path:/^\/c\/product\//,search:p=>'https://www.bhphotovideo.com/c/search?Ntt='+encodeURIComponent(p)+'&N=0&InitialSearch=yes'},
 {id:'cdw',name:'CDW',host:'www.cdw.com',path:/^\/product\//,search:p=>'https://www.cdw.com/search/?key='+encodeURIComponent(p)},
 {id:'bestbuy',name:'Best Buy',host:'www.bestbuy.com',path:/^\/(?:site|product)\//,search:p=>'https://www.bestbuy.com/site/searchpage.jsp?st='+encodeURIComponent(p)},
 {id:'lenovo',name:'Lenovo',host:'www.lenovo.com',path:/^\/us\/en\/p\//,search:p=>'https://www.lenovo.com/us/en/search?text='+encodeURIComponent(p)},
 {id:'hp',name:'HP',host:'www.hp.com',path:/^\/us-en\/shop\/pdp\//,search:p=>'https://www.hp.com/us-en/shop/sitesearch?keyword='+encodeURIComponent(p)}
]);
const fail=m=>{throw new HttpError(400,m);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
export const normalizeIdentity=x=>String(x||'').trim().toUpperCase();
function text(x,field,max=160){if(typeof x!=='string'||!x.trim()||x.length>max||/[\x00-\x1f\x7f]/.test(x))fail('Invalid '+field+'.');return x.trim();}
const integer=(x,name,min=0,max=100000000)=>{if(!Number.isSafeInteger(x)||x<min||x>max)fail('Invalid '+name+'.');return x;};
const enumValue=(x,choices,name)=>{if(!choices.includes(x))fail('Invalid '+name+'.');return x;};
export function marketIdentity(product){return {manufacturer:normalizeIdentity(product.manufacturer),mfgPart:normalizeIdentity(product.mfgPart)};}
export function blankMarketBook(product){return {schemaVersion:1,mode:'preview',productId:product.id,identity:marketIdentity(product),revision:0,offers:[],history:[]};}
export function retailerUrl(retailerId,input){
 const r=RETAILERS.find(r=>r.id===retailerId);if(!r)fail('Choose a supported retailer.');
 if(typeof input!=='string'||input.length>1200||/[\s\x00-\x1f\x7f]/.test(input))fail('Invalid product link.');let u;try{u=new URL(input);}catch{fail('Use an HTTPS product-page link.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.replace(/^www\./,'')!==r.host.replace(/^www\./,'')||!r.path.test(u.pathname))fail('The link must be a product page at the selected retailer.');
 // No fetch is performed. Tracking/query/fragment values must not carry secrets to storage or logs.
 if((r.id==='newegg'&&/^\/p\/pl\/?$/.test(u.pathname))||(r.id==='bestbuy'&&!/\.p$/.test(u.pathname)&&!u.pathname.startsWith('/product/')))fail('Use a specific product page, not search results.');
 u.hostname=r.host;u.search='';u.hash='';return u.href;
}
export function validateMarketOffer(input,product,{nowMs=Date.now()}={}){
 const allowed=['retailer','url','sellerGroup','manufacturer','mfgPart','itemPriceCents','shippingCents','currency','condition','availability','quantity','bundle','publicPrice','configurationConfirmed','sellerReviewed','destinationZip','observedAt'];
 if(!object(input)||Object.keys(input).some(k=>!allowed.includes(k)))fail('Unsupported comparison field.');
 const retailer=RETAILERS.find(r=>r.id===input.retailer);if(!retailer)fail('Choose a supported retailer.');
 const manufacturer=text(input.manufacturer,'manufacturer'),mfgPart=text(input.mfgPart,'full manufacturer part number',110);
 if(normalizeIdentity(manufacturer)!==normalizeIdentity(product.manufacturer)||normalizeIdentity(mfgPart)!==normalizeIdentity(product.mfgPart))fail('Retail offer must match the saved manufacturer and complete part number. Do not drop option suffixes.');
 const sellerGroup=text(input.sellerGroup,'independent seller identity',100).toLowerCase().replace(/\s+/g,' ');
 const observedAt=text(input.observedAt,'observation time',35),t=Date.parse(observedAt);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==observedAt||t>nowMs+60000||t<nowMs-30*MARKET_MAX_AGE_MS)fail('Use the actual check time within the last 30 days, not a future time.');
 if(!/^\d{5}$/.test(input.destinationZip||''))fail('Enter the five-digit US ZIP used for price and shipping.');
 for(const k of ['bundle','publicPrice','configurationConfirmed','sellerReviewed'])if(typeof input[k]!=='boolean')fail('Confirm '+k+'.');
 const price=input.itemPriceCents===null?null:integer(input.itemPriceCents,'item price',1);
 const shipping=input.shippingCents===null?null:integer(input.shippingCents,'shipping',0);
 return {retailer:retailer.id,url:retailerUrl(retailer.id,input.url),sellerGroup,manufacturer,mfgPart,itemPriceCents:price,shippingCents:shipping,
  currency:enumValue(input.currency,['USD','CAD','EUR','unknown'],'currency'),condition:enumValue(input.condition,['new','used','refurbished','unknown'],'condition'),
  availability:enumValue(input.availability,['in_stock','out_of_stock','unknown'],'availability'),quantity:integer(input.quantity,'pack quantity',1,1000),
  bundle:input.bundle,publicPrice:input.publicPrice,configurationConfirmed:input.configurationConfirmed,sellerReviewed:input.sellerReviewed,
  destinationZip:input.destinationZip,observedAt,recordedAt:new Date(nowMs).toISOString(),collection:'manual-reviewed'};
}
export function marketSummary(book,product,{nowMs=Date.now(),destinationZip='',suggestedPriceCents=null}={}){
 if(destinationZip&&!/^\d{5}$/.test(destinationZip))fail('Invalid comparison ZIP.');
 const identity=marketIdentity(product),binding=book.productId===product.id&&book.identity?.manufacturer===identity.manufacturer&&book.identity?.mfgPart===identity.mfgPart;
 const rows=(book.offers||[]).map(o=>{
  const reasons=[],age=nowMs-Date.parse(o.observedAt);
  if(!binding)reasons.push('Saved product identity changed');
  if(normalizeIdentity(o.manufacturer)!==identity.manufacturer||normalizeIdentity(o.mfgPart)!==identity.mfgPart)reasons.push('Exact product mismatch');
  if(!Number.isFinite(age)||age>MARKET_MAX_AGE_MS||age< -60000)reasons.push('Observation is stale or has an invalid time');
  if(o.currency!=='USD')reasons.push('Not confirmed USD');
  if(o.condition!=='new')reasons.push('Not new');
  if(o.availability!=='in_stock')reasons.push('Not confirmed in stock');
  if(o.quantity!==1||o.bundle)reasons.push('Bundle / multipack not comparable');
  if(!o.publicPrice)reasons.push('Membership, coupon, rebate or private price');
  if(!o.configurationConfirmed)reasons.push('Exact configuration / warranty not reviewed');
  if(!o.sellerReviewed)reasons.push('Seller identity not reviewed');
  if(!Number.isSafeInteger(o.itemPriceCents)||o.itemPriceCents<=0)reasons.push('Item price missing');
  if(o.destinationZip!==destinationZip)reasons.push('Different or unspecified destination ZIP');
  return {...o,reasons,included:false,deliveredIncluded:false};
 });
 // One current selected listing per retailer, one independent seller across the comparison.
 // The store replaces a retailer's last observation, including a new out-of-stock observation.
 const sources=new Set(),sellers=new Set();
 for(const row of [...rows].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.retailer.localeCompare(b.retailer))){
  if(row.reasons.length)continue;
  if(sources.has(row.retailer)||sellers.has(row.sellerGroup)){row.reasons.push('Duplicate retailer or independent seller');continue;}
  sources.add(row.retailer);sellers.add(row.sellerGroup);row.included=true;
  row.deliveredIncluded=Number.isSafeInteger(row.shippingCents)&&row.shippingCents>=0;
 }
 const included=rows.filter(r=>r.included),delivered=included.filter(r=>r.deliveredIncluded),numbers=included.map(r=>r.itemPriceCents),deliveredNumbers=delivered.map(r=>r.itemPriceCents+r.shippingCents);
 const mean=values=>values.length>=2?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;
 const median=values=>{if(values.length<2)return null;const a=[...values].sort((a,b)=>a-b),n=a.length;return n%2?a[(n-1)/2]:Math.round((a[n/2-1]+a[n/2])/2);};
 const averageCents=mean(numbers),medianCents=median(numbers),deliveredAverageCents=mean(deliveredNumbers);
 const dispersion=medianCents!==null&&numbers.some(n=>n<medianCents/2||n>medianCents*2);
 const priced=Number.isSafeInteger(suggestedPriceCents)&&suggestedPriceCents>0;
 return {currency:'USD',basis:'one new single-unit public offer per independent retailer/seller; item price excluding tax and shipping',destinationZip,
  sourceCount:included.length,deliveredSourceCount:delivered.length,evidence:included.length===0?'no-comparable-offers':included.length===1?'one-source-not-an-average':included.length===2?'limited-two-source-sample':'multi-source-sample',
  averageCents,medianCents,lowCents:numbers.length?Math.min(...numbers):null,highCents:numbers.length?Math.max(...numbers):null,
  deliveredAverageCents,deliveredMedianCents:median(deliveredNumbers),deliveredLowCents:deliveredNumbers.length?Math.min(...deliveredNumbers):null,deliveredHighCents:deliveredNumbers.length?Math.max(...deliveredNumbers):null,
  oldestIncludedAt:included.length?included.map(r=>r.observedAt).sort()[0]:null,newestIncludedAt:included.length?included.map(r=>r.observedAt).sort().at(-1):null,
  largePriceSpread:dispersion,comparisonDeltaCents:priced&&averageCents!==null?suggestedPriceCents-averageCents:null,
  comparisonDeltaBps:priced&&averageCents!==null?Math.round((suggestedPriceCents-averageCents)*10000/averageCents):null,
  rows,automaticCollection:false,automaticRepricing:false,publicDisplay:false,mapAssessment:'not-performed',sellerIdentityBasis:'staff-assigned groups; independence and aliases are not automatically verified'};
}
