// Server-side preview-only Google Shopping research. Exactly one SerpApi search on explicit admin action.
// Raw responses, API key, provider metadata URLs, and Google tracking links are never returned or persisted.
import {HttpError} from './model.mjs';
import {validProductId} from './product-controls-model.mjs';

export class ShoppingResearchError extends HttpError {
  constructor(status,code,message){super(status,message);this.name='ShoppingResearchError';this.code=code;}
}
const err=(status,code,msg)=>{throw new ShoppingResearchError(status,code,msg);};
const str=(v,max=200)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):'';
function cents(v){if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>1000000)return null;const x=Math.round(v*100);return Number.isSafeInteger(x)&&x>0?x:null;}
const WEB_HOSTS = Object.freeze(['staples.com','newegg.com','neweggbusiness.com','walmart.com','bhphotovideo.com','cdw.com','bestbuy.com','compsource.com','shi.com','lenovo.com','hp.com','target.com','amazon.com','adorama.com']);
function safeVendorLink(raw){
 if(typeof raw!=='string'||raw.length>1600||/[\x00-\x20\x7f]/.test(raw))return null;
 try{const u=new URL(raw),h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||!WEB_HOSTS.some(known=>h===known||h.endsWith('.'+known)))return null;
  // Never retain search-tracking parameters, fragments, or API keys.
  u.search='';u.hash='';return u.href;
 }catch{return null;}
}
function googleReference(productId){
 const id=typeof productId==='number'&&Number.isSafeInteger(productId)?String(productId):productId;
 if(typeof id!=='string'||!/^\d{5,25}$/.test(id))return null;
 return 'https://www.google.com/search?udm=28&gl=us&hl=en&prds='+encodeURIComponent('catalogid:'+id);
}
function link(raw){
 if(typeof raw!=='string'||raw.length>1600||/[\x00-\x20\x7f]/.test(raw))return null;
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 // Google product links are discovery links, not evidence of a retailer's checkout offer.
 if(!['www.google.com','google.com','shopping.google.com'].includes(u.hostname))return null;
 if(!u.pathname.startsWith('/shopping/product/'))return null;
 u.search='';u.hash='';return u.href;}catch{return null;}
}
function tokenInText(text,part){const needle=part.toUpperCase(),upper=text.toUpperCase();let at=upper.indexOf(needle);while(at!==-1){const before=at===0?'':upper[at-1],after=upper[at+needle.length]||'';if(!/[A-Z0-9]/.test(before)&&!/[A-Z0-9]/.test(after))return true;at=upper.indexOf(needle,at+1);}return false;}
export function normalizeShopping(data,product,{checkedAt=new Date().toISOString()}={}){
 if(!data||typeof data!=='object'||Array.isArray(data))err(502,'bad_shape','Shopping provider returned an invalid response.');
 // Provider errors may echo secrets; never forward their messages.
 if(data.error||data.search_metadata?.status==='Error')err(502,'provider_error','Shopping provider returned an error. Check your SerpApi dashboard.');
 if(!Array.isArray(data.shopping_results)){
  if(data.search_metadata?.status==='Success')return {mode:'shopping',productId:product.id,checkedAt,query:product.mfgPart,candidates:[],totalReturned:0,exactTitleMatches:0,preliminaryAverageCents:null};
  err(502,'missing_results','Shopping provider did not return a usable result collection.');
 }
 if(data.shopping_results.length>300)err(502,'oversized_results','Shopping result list exceeded the expected limit.');
 const candidates=data.shopping_results.slice(0,40).map((r,i)=>{
  const title=str(r?.title,260),source=str(r?.source,100),priceCents=cents(r?.extracted_price),condition=str(r?.second_hand_condition,80),displayPrice=str(r?.price,45);
  const usdDisplayed=/^(?:\$\s*[0-9]|USD\s*\$?\s*[0-9])/i.test(displayPrice);
  const researchCurrency=usdDisplayed?(/^USD/i.test(displayPrice)?'explicit-usd':'dollar-symbol'):'other';
  const combined=(title+' '+str(r?.snippet,300)).toUpperCase();const exactPartVisible=tokenInText(combined,product.mfgPart);
  const secondhand=/used|refurb|renewed|open box|pre-owned|preowned/i.test(title+' '+condition);
  const financed=!!r?.installment||/month|monthly|payments?\s*of|with plan/i.test(title);
  const googleProductLink=link(r?.product_link)||googleReference(r?.product_id);
  const issues=[];if(!exactPartVisible)issues.push('complete part number not visible');if(secondhand)issues.push('used/refurbished');if(financed)issues.push('installment/contract pricing');if(r?.multiple_sources===true)issues.push('multiple underlying sellers');if(priceCents===null)issues.push('missing or unusable price');if(!usdDisplayed)issues.push('USD currency not established from displayed price');if(!googleProductLink)issues.push('no safe Google product link');
  // Even a title that includes the MPN cannot prove the variant, independent seller,
  // public price, stock, warranty, seller URL, tax or shipping charge.
  issues.push('seller, stock, configuration, public price and delivery require review');
  return {position:Number.isInteger(r?.position)?r.position:i+1,title,source,priceCents,currencyIndicator:displayPrice,conditionIndicator:condition,googleProductLink,
    researchCurrency,availabilitySignal:researchAvailabilitySignal(title,str(r?.snippet,300)),exactPartVisible,preliminary:issues.length===1,issues,reviewed:false,eligibleForVerifiedAverage:false};
 });
 const exactTitleMatches=candidates.filter(c=>c.exactPartVisible).length;
 // Preliminary benchmark for inspection only; not part of verified market summary.
 const group=new Map();for(const c of candidates){if(!c.preliminary||!c.source)continue;const k=c.source.toLowerCase();if(!group.has(k))group.set(k,c.priceCents);}
 const values=[...group.values()];const preliminaryAverageCents=values.length>=2?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;
 return {mode:'shopping',productId:product.id,checkedAt,query:product.mfgPart,candidates,totalReturned:data.shopping_results.length,exactTitleMatches,
  preliminaryAverageCents,preliminarySourceCount:values.length,disclaimer:'Unverified search snapshot only. The verified retailer average remains unchanged until source, identity, condition, stock and price are reviewed.',
  currencyAssumption:'USD search locale; verify each price',collection:'one explicit Google Shopping search; no scheduled refresh'};
}
function snippetAmount(r,snippet){
 // Dollar snippets are research evidence, never a verified offer. Explicit foreign currencies cannot mix.
 if(/(?:CAD|CA\$|C\$|AUD|AU\$|A\$|NZD|NZ\$|HKD|HK\$|SGD|SG\$|ZAR|GBP|EUR|KWD|AED|\u00a3|\u20ac)/i.test(snippet))return {cents:null,basis:null,currency:'other'};
 if(/(?:\bper month\b|\bmonthly\b|\binstalments?\b|\binstallments?\b|\bfinancing\b|\bsave\s*\$|\bstarting at\b|\bcoupon\b|\brebate\b)/i.test(snippet))return {cents:null,basis:null,currency:'unknown'};
 const rich=[r?.rich_snippet?.top?.detected_extensions,r?.rich_snippet?.bottom?.detected_extensions],known=[];let explicit=false,structured=false;
 for(const d of rich){if(!d||typeof d!=='object')continue;const currency=str(d.currency,15).toUpperCase();
  if(d.price!==undefined&&currency&&currency!=='$'&&currency!=='USD')return {cents:null,basis:null,currency:'other'};
  if(currency==='$'||currency==='USD'){const raw=d.price,v=typeof raw==='number'?raw:typeof raw==='string'&&/^(?:\$\s*)?[0-9,]+(?:\.\d{1,2})?$/.test(raw)?Number(raw.replace(/[$,\s]/g,'')):null;const n=cents(v);if(n!==null){known.push(n);structured=true;explicit||=currency==='USD';}}
 }
 const matches=[...snippet.matchAll(/(?<![A-Za-z0-9-])(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?![\d,]|\.\d)/gi)];
 for(const m of matches){const n=Number(m[1].replaceAll(',',''))*100+Number(m[2]||0);if(Number.isSafeInteger(n)&&n>0&&n<=100000000){known.push(n);explicit||=/USD/i.test(m[0]);}}
 const unique=[...new Set(known)];return unique.length===1?{cents:unique[0],basis:structured?'structured search snippet':'unverified search snippet',currency:explicit?'explicit-usd':'dollar-symbol'}:{cents:null,basis:null,currency:'unknown'};
}
function sourceHost(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.hostname.toLowerCase().replace(/^www\./,'').slice(0,120):'';}catch{return '';}}
// Search metadata can reveal obvious backorders, but cannot establish fresh warehouse stock.
export function researchAvailabilitySignal(title,snippet){
 const text=(str(title,260)+' '+str(snippet,430)).toLowerCase();
 if(/\b(?:back[ -]?order(?:ed)?|back[ -]?ordered|stock\s*:\s*0|0\s+in\s+stock|currently\s+unavailable)\b/i.test(text))
  return {status:'backorder_or_zero',note:'Backorder or zero-stock indicator — do not include in an in-stock benchmark'};
 if(/\b(?:out[ -]?of[ -]?stock|sold[ -]?out|not\s+in\s+stock|not\s+available|unavailable\s+for\s+purchase)\b/i.test(text))
  return {status:'out_of_stock',note:'Out-of-stock indication — exclude from an in-stock benchmark'};
 if(/\b(?:supplied\s+to\s+order|available\s+to\s+order|manufacturer\s+drop[ -]?ship|drop[ -]?ship\s+from\s+manufacturer|special\s+order|order\s+on\s+request|ships?\s+within\s+\d+[-–]\d+\s+business\s+days)\b/i.test(text))
  return {status:'supplier_order',note:'Supplier-order/dropship language — physical inventory not confirmed'};
 if(/\b(?:in\s+stock|ready\s+to\s+ship|available\s+for\s+immediate\s+shipment)\b/i.test(text))
  return {status:'in_stock_claim',note:'Search result claims stock; verify directly on retailer site'};
 return {status:'unknown',note:'No verifiable stock evidence in search result'};
}
function safeResearchSearch(part,title){
 // A Google search link for discovery, not a direct checkout URL or supplier identity endorsement.
 const q='"'+String(part).slice(0,100)+'" '+str(title,70);
 return 'https://www.google.com/search?q='+encodeURIComponent(q);
}
export function normalizeExactWebListings(data,product,{checkedAt=new Date().toISOString()}={}){
 if(!data||typeof data!=='object'||Array.isArray(data))err(502,'bad_shape','Search provider returned an invalid response.');
 if(data.error||data.search_metadata?.status==='Error')err(502,'provider_error','Search provider returned an error. Check your SerpApi dashboard.');
 if(!Array.isArray(data.organic_results)){
  if(data.search_metadata?.status==='Success')return {mode:'exact_web',productId:product.id,checkedAt,totalReturned:0,exactTitleMatches:0,candidates:[],preliminaryAverageCents:null};
  err(502,'missing_results','Search provider did not return a usable organic result collection.');
 }
 if(data.organic_results.length>100)err(502,'oversized_results','Search result list exceeded the expected limit.');
 const candidates=data.organic_results.slice(0,25).map((r,i)=>{
  const title=str(r?.title,260),snippet=str(r?.snippet,430),vendorLink=safeVendorLink(r?.link);
  const hint=snippetAmount(r,snippet),availabilitySignal=researchAvailabilitySignal(title,snippet);
  const exactPartVisible=tokenInText(title+' '+snippet,product.mfgPart)||tokenInText(str(r?.link,1500),product.mfgPart);
  const secondhand=/used|refurbished|renewed|open box|preowned|pre-owned/i.test(title+' '+snippet);
  const issues=[];
  if(!exactPartVisible)issues.push('complete part number not visible');
  if(secondhand)issues.push('used/refurbished description');
  if(!vendorLink)issues.push('retailer domain not yet approved for a direct link');
  if(hint.cents!==null)issues.push('displayed search price is an unverified hint, not a checkout quote');
  if(availabilitySignal.status!=='unknown')issues.push(availabilitySignal.note);
  issues.push('product identity, price, inventory, seller and shipping require direct verification');
  return {position:Number.isInteger(r?.position)?r.position:i+1,title,source:vendorLink?new URL(vendorLink).hostname:str(r?.source||'Web search',100),snippet,priceCents:null,
   priceHintCents:hint.cents,priceHintBasis:hint.basis,researchCurrency:hint.currency,sourceHost:sourceHost(r?.link),availabilitySignal,exactPartVisible,googleProductLink:null,vendorLink,researchLink:safeResearchSearch(product.mfgPart,title),
   issues,reviewed:false,eligibleForVerifiedAverage:false};
 });
 candidates.sort((a,b)=>Number(b.exactPartVisible)-Number(a.exactPartVisible)||a.position-b.position);
 return {mode:'exact_web',productId:product.id,checkedAt,totalReturned:data.organic_results.length,exactTitleMatches:candidates.filter(c=>c.exactPartVisible).length,
  candidates,priceHintCount:candidates.filter(x=>x.exactPartVisible&&x.priceHintCents!==null).length,preliminaryAverageCents:null,preliminarySourceCount:0,disclaimer:'Retailer links are exact-part research leads. Prices, condition and stock require direct verification.',
  collection:'one explicit Google Search request; no scheduled refresh'};
}
async function jsonCapped(response){
 if(!/json/i.test(response.headers?.get?.('content-type')||''))err(502,'content_type','Shopping provider returned non-JSON content.');
 if(Number(response.headers?.get?.('content-length')||0)>700000)err(502,'response_size','Shopping response exceeded the size limit.');
 let text='';if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>700000){await reader.cancel();err(502,'response_size','Shopping response exceeded the size limit.');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}text=Buffer.concat(parts).toString('utf8');}else{text=await response.text();if(Buffer.byteLength(text)>700000)err(502,'response_size','Shopping response exceeded the size limit.');}
 try{return JSON.parse(text);}catch{err(502,'invalid_json','Shopping provider returned invalid JSON.');}
}
export function createShoppingCollector({env=process.env,fetcher=fetch,clock=()=>Date.now()}={}){
 const configured=()=>env.VERCEL_ENV!=='production'&&typeof env.TP_SERPAPI_KEY==='string'&&env.TP_SERPAPI_KEY.length>=12;
 return {
  status:()=>({configured:configured(),provider:'SerpApi Google Shopping',previewOnly:true,manualTriggerOnly:true,queriesPerTrigger:1,verifiedAverageAutoUpdated:false}),
  async search(product,{mode='shopping'}={}){
   if(env.VERCEL_ENV==='production')err(503,'production_disabled','Retail research is not enabled in production.');
   if(!configured())err(503,'not_configured','SerpApi key is not configured for this Preview branch.');
   if(!['shopping','exact_web'].includes(mode))err(400,'invalid_mode','Select an available research mode.');
   validProductId(product.id);
   if(typeof product.mfgPart!=='string'||!/^[-A-Za-z0-9._#]{4,100}$/.test(product.mfgPart))err(400,'bad_part','Saved product lacks a usable complete manufacturer part number.');
   const query=mode==='exact_web'?'"'+product.mfgPart+'" '+String(product.manufacturer||'').trim():'"'+product.mfgPart+'" '+String(product.manufacturer||'').trim();
   const url=new URL('https://serpapi.com/search.json');for(const [key,value]of Object.entries({engine:mode==='exact_web'?'google':'google_shopping',q:query,gl:'us',hl:'en',device:'desktop',api_key:env.TP_SERPAPI_KEY}))url.searchParams.set(key,value);
   // Server only; the URL carries a credential and must not be logged or returned.
   let response;try{response=await fetcher(url.href,{method:'GET',redirect:'error',headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});}catch{err(502,'unavailable','Shopping provider could not be reached.');}
   if(response.status===429)err(429,'credits_or_rate','SerpApi quota or rate limit reached. Check your dashboard before retrying.');
   if(response.status===401||response.status===403)err(502,'invalid_credentials','SerpApi authentication was rejected. Check the Preview key.');
   if(!response.ok)err(502,'provider_http','Shopping provider rejected the search.');
   const data=await jsonCapped(response);return mode==='exact_web'?normalizeExactWebListings(data,product,{checkedAt:new Date(clock()).toISOString()}):normalizeShopping(data,product,{checkedAt:new Date(clock()).toISOString()});
  }
 };
}
