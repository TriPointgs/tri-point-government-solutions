// Internal descriptive average of search-reported prices, NOT verified retail offers or a buy-now benchmark.
// A source with no price is counted as missing, never as zero; stock status does not erase a research quote.
import {HttpError} from './model.mjs';
export const RESEARCH_MAX_AGE_MS=24*60*60*1000;
const clean=(v,max=300)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):'';
const norm=v=>clean(v,160).toUpperCase();
export const researchIdentity=p=>({manufacturer:norm(p.manufacturer),mfgPart:norm(p.mfgPart)});
export const blankResearch=p=>({schemaVersion:1,productId:p.id,mode:'preview',revision:0,identity:researchIdentity(p),runs:{}});
const amount=v=>Number.isSafeInteger(v)&&v>0&&v<=100000000?v:null;
export function sourceGroup(c){
 let s=clean(c.sourceHost||c.source,120).toLowerCase().replace(/^www\./,'').replace(/\s+/g,' ');
 const aliases=[['newegg','newegg.com'],['walmart','walmart.com'],['amazon','amazon.com'],['staples','staples.com'],['best buy','bestbuy.com'],['bestbuy','bestbuy.com'],['b&h','bhphotovideo.com'],['bhphotovideo','bhphotovideo.com'],['shi.com','shi.com'],['cdw','cdw.com']];
 if(s==='shi')return 'shi.com';
 for(const [prefix,key]of aliases)if(s===prefix||s.startsWith(prefix+'.')||s.startsWith(prefix+' -')||s.startsWith(prefix+' ')||s===key)return key;
 return s||'unknown-source';
}
function safeLink(value){
 if(!value)return null;try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 // Input is an allowlisted link emitted by our normalizer. Keep only site/path; no provider tokens.
 if(/(?:^|\.)serpapi\.com$/.test(u.hostname))return null;
 u.search='';u.hash='';return u.href.slice(0,1600);}catch{return null;}
}
export function compactResearchRun(result,product){
 const t=Date.parse(result?.checkedAt);
 if(!['shopping','exact_web'].includes(result?.mode)||result.productId!==product.id||!Array.isArray(result.candidates)||!Number.isFinite(t))throw new HttpError(502,'Invalid research result for storage.');
 const rows=result.candidates.slice(0,40).map(c=>({source:clean(c.source,100),sourceKey:sourceGroup(c),title:clean(c.title,260),
  exactPartVisible:c.exactPartVisible===true,
  amountCents:amount(c.priceCents)??amount(c.priceHintCents),
  currencyEvidence:['explicit-usd','dollar-symbol','other','unknown'].includes(c.researchCurrency)?c.researchCurrency:'unknown',
  excluded:(Array.isArray(c.issues)?c.issues:[]).filter(x=>/used\/refurbished|installment|contract pricing|multiple underlying sellers|bundle\/multipack|conditional price|currency/.test(x)).map(x=>clean(x,120)),
  availability:clean(c.availabilitySignal?.status||'unknown',40),link:safeLink(c.vendorLink||c.googleProductLink),
  retrievalMode:result.mode,checkedAt:new Date(t).toISOString()}));
 return {mode:result.mode,checkedAt:new Date(t).toISOString(),totalReturned:Number.isSafeInteger(result.totalReturned)?Math.max(result.totalReturned,rows.length):rows.length,rows};
}
export function mergeResearch(record,product,run){
 const identity=researchIdentity(product),same=record.identity?.manufacturer===identity.manufacturer&&record.identity?.mfgPart===identity.mfgPart;
 const next=same?structuredClone(record):{...blankResearch(product),revision:record.revision};
 const prior=next.runs[run.mode];
 if(prior){const oldTime=Date.parse(prior.startedAt||prior.checkedAt),newTime=Date.parse(run.startedAt||run.checkedAt);
  if(oldTime>newTime)return {record:next,changed:false,disposition:'superseded'};
  if(oldTime===newTime){const sameRun=JSON.stringify(prior)===JSON.stringify(run);return {record:next,changed:false,disposition:sameRun?'unchanged':'ambiguous-order'};}
 }
 next.runs[run.mode]=run;next.revision++;return {record:next,changed:true,disposition:'saved'};
}
export function researchReport(record,product,{nowMs=Date.now()}={}){
 const expected=researchIdentity(product),same=record.productId===product.id&&record.identity?.manufacturer===expected.manufacturer&&record.identity?.mfgPart===expected.mfgPart;
 const all=same?Object.values(record.runs||{}).filter(r=>['shopping','exact_web'].includes(r.mode)&&Array.isArray(r.rows)&&Number.isFinite(Date.parse(r.checkedAt))&&Date.parse(r.checkedAt)<=nowMs+60000):[];
 const fresh=all.filter(r=>nowMs-Date.parse(r.checkedAt)<=RESEARCH_MAX_AGE_MS),expired=all.length>0&&!fresh.length;
 const runs=fresh.length?fresh:all;
 const groups=new Map();let exactRows=0,duplicates=0;
 for(const r of [...runs].sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt))){
  for(const row of r.rows){if(!row.exactPartVisible)continue;exactRows++;const key=row.sourceKey;
   if(groups.has(key)){duplicates++;const prior=groups.get(key);
    if(prior.checkedAt===row.checkedAt&&prior.amountCents!==null&&row.amountCents!==null&&prior.amountCents!==row.amountCents)groups.set(key,{...prior,excluded:[...prior.excluded,'Conflicting simultaneous prices from the same source']});
    continue;}
   groups.set(key,row);
  }
 }
 const rows=[...groups.values()].map(r=>({...r,included:!!amount(r.amountCents)&&!r.excluded.length&&['explicit-usd','dollar-symbol'].includes(r.currencyEvidence)&&r.sourceKey!=='unknown-source'}));
 const included=rows.filter(r=>r.included),values=included.map(r=>r.amountCents).sort((a,b)=>a-b),n=values.length;
 const average=n>=2?Math.round(values.reduce((a,b)=>a+b,0)/n):null;
 const median=n<2?null:n%2?values[Math.floor(n/2)]:Math.round((values[n/2-1]+values[n/2])/2);
 const available={};for(const r of included)available[r.availability]=(available[r.availability]||0)+1;
 return {kind:'search-research-only',revision:record.revision,hasSavedSearch:runs.length>0,expired,
  averageCents:average,medianCents:median,lowCents:n?values[0]:null,highCents:n?values.at(-1):null,
  pricedSources:n,exactSources:rows.length,exactRows,returnedListings:runs.reduce((a,r)=>a+r.totalReturned,0),duplicateRows:duplicates,
  missingPriceSources:rows.filter(r=>r.amountCents===null).length,excludedPriceSources:rows.filter(r=>r.amountCents!==null&&!r.included).length,
  availabilityCounts:available,knownUSDOnly:included.length>0&&included.every(r=>r.currencyEvidence==='explicit-usd'),
  currencyBasis:'Dollar-denominated search quotes; USD assumed where only $ is supplied. Currency, country and checkout price are not verified.',
  stockBasis:'All usable exact-part price-bearing sources, including backorders and unknown inventory. Not an in-stock average.',
  newestAt:runs.length?runs.map(r=>r.checkedAt).sort().at(-1):null,oldestAt:runs.length?runs.map(r=>r.checkedAt).sort()[0]:null,
  sourceRows:rows,publicationAllowed:false,checkoutEligible:false,automaticRepricing:false};
}
