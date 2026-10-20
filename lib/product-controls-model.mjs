import {internalPriceContext} from './internal-price-context.mjs';
// Private product-selection rules. Filtering is applied to the complete bounded
// selection before sorting/pagination, not just to the visible source-search page.
import {HttpError} from './model.mjs';
import {calculateMarketplacePrice,validatePricingPolicy} from './marketplace-pricing.mjs';
export const PRODUCT_CATEGORIES=Object.freeze(['unknown','laptops','desktops','monitors','networking','software','accessories']);
export const PRODUCT_LIMIT=500;
export const PRODUCT_PAGE_SIZE=25;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const invalid=message=>{throw new HttpError(400,message);};
export function productText(x,name,max=160,{optional=false}={}) {
  if(optional&&(x===undefined||x===null))return '';
  if(typeof x!=='string'||x.length>max||/[\x00-\x1f\x7f]/.test(x)||(!optional&&!x.trim()))invalid('Invalid '+name+'.');
  return x.trim();
}
export const normalized=x=>String(x||'').trim().toUpperCase();
export function productId(sku){sku=String(sku);if(!/^[1-9]\d{0,11}$/.test(sku))invalid('A numeric TD SKU is required.');return 'TD-'+sku;}
export function validProductId(id){if(typeof id!=='string'||!/^TD-[1-9]\d{0,11}$/.test(id))invalid('Invalid saved product.');return id;}
export function newProductWorkspace(){return {schemaVersion:1,revision:0,mode:'preview',updatedAt:null,items:[],policy:validateExclusions({}),pricingPolicy:JSON.parse(JSON.stringify(validatePricingPolicy())),history:[]};}
function stringList(value,name,max=100) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>max)invalid('Too many '+name+' rules.');
  return [...new Set(value.map(x=>normalized(productText(x,name,100))))];
}
export function validateExclusions(input){
  const allowed=['excludedManufacturers','excludedCategories','excludedParts','excludedKeywords','hideAccessories','newOnly'];
  if(!plain(input)||Object.keys(input).some(k=>!allowed.includes(k)))invalid('Invalid exclusion rules.');
  const result={excludedManufacturers:stringList(input.excludedManufacturers,'manufacturer'),excludedCategories:stringList(input.excludedCategories,'category',7).map(x=>x.toLowerCase()),excludedParts:stringList(input.excludedParts,'part/SKU',200),excludedKeywords:stringList(input.excludedKeywords,'keyword',50),hideAccessories:input.hideAccessories??false,newOnly:input.newOnly??false};
  if(typeof result.hideAccessories!=='boolean'||typeof result.newOnly!=='boolean'||result.excludedCategories.some(x=>!PRODUCT_CATEGORIES.includes(x)))invalid('Invalid category or condition rule.');
  return result;
}
export function candidateFromSnapshot(item,{query,at,snapshotDate=''}) {
  if(!plain(item))invalid('Invalid source product.');
  const sku=productText(String(item.distributorId||''),'TD SKU',12);productId(sku);
  const category=query.category!=='all'&&PRODUCT_CATEGORIES.includes(query.category)?query.category:'unknown';
  return {id:productId(sku),sku,mfgPart:productText(item.mfgPart,'manufacturer part number',110),manufacturer:productText(item.manufacturer,'manufacturer',140),description:productText(item.description,'description',500),productFamily:productText(item.productFamily||'','product family',130,{optional:true}),
    source:{kind:'private-td-snapshot',importedAt:at,snapshotDate:productText(snapshotDate||'','snapshot date',40,{optional:true})},
    category,categoryConfirmed:false,condition:'unknown',decision:'draft',
    review:{resaleConfirmed:false,contentConfirmed:false,evidence:'',reviewedAt:null},observation:null,lastCheckFailure:null};
}
export function mergeCandidates(state,candidates){
  const next=structuredClone(state),added=[],updated=[];
  for(const incoming of candidates){
    const index=next.items.findIndex(x=>x.id===incoming.id);
    if(index<0){if(next.items.length>=PRODUCT_LIMIT)throw new HttpError(409,'The 500-product pilot selection is full. No partial import was saved.');next.items.push(incoming);added.push(incoming.id);continue;}
    const prior=next.items[index];
    const identityChanged=normalized(prior.mfgPart)!==normalized(incoming.mfgPart)||normalized(prior.manufacturer)!==normalized(incoming.manufacturer);
    const copyChanged=prior.description!==incoming.description;
    // Re-importing never clears a manual exclusion. Identity/copy changes invalidate review.
    next.items[index]={...prior,mfgPart:incoming.mfgPart,manufacturer:incoming.manufacturer,description:incoming.description,productFamily:incoming.productFamily,source:incoming.source,
      ...(identityChanged?{category:incoming.category,categoryConfirmed:false,condition:'unknown',review:incoming.review,observation:null,lastObservation:null,lastCheckFailure:null}:copyChanged?{review:{...prior.review,contentConfirmed:false}}:{})};
    updated.push(incoming.id);
  }
  return {state:next,added:[...new Set(added)],updated:[...new Set(updated)]};
}
export function reviewProduct(item,patch,at){
  if(!plain(patch)||Object.keys(patch).some(k=>!['category','categoryConfirmed','condition','decision','resaleConfirmed','contentConfirmed','evidence'].includes(k)))invalid('Unsupported product review field.');
  const next=structuredClone(item);
  for(const [k,values] of Object.entries({category:PRODUCT_CATEGORIES,condition:['unknown','new','refurbished','used'],decision:['draft','excluded']}))if(patch[k]!==undefined){if(!values.includes(patch[k]))invalid('Invalid '+k+'.');next[k]=patch[k];}
  if(patch.categoryConfirmed!==undefined){if(typeof patch.categoryConfirmed!=='boolean')invalid('Invalid category confirmation.');next.categoryConfirmed=patch.categoryConfirmed;}
  if(next.category==='unknown'&&next.categoryConfirmed)invalid('Choose a category before confirming it.');
  for(const k of ['resaleConfirmed','contentConfirmed'])if(patch[k]!==undefined){if(typeof patch[k]!=='boolean')invalid('Invalid review confirmation.');next.review[k]=patch[k];}
  if(patch.evidence!==undefined)next.review.evidence=productText(patch.evidence,'review reference',300,{optional:true});
  if((next.review.resaleConfirmed||next.review.contentConfirmed)&&next.review.evidence.length<8)invalid('Record the supporting approval reference before confirming resale or content rights.');
  next.review.reviewedAt=at;
  return next;
}
export function exclusionReasons(item,policy){
  const reasons=[];if(item.decision==='excluded')reasons.push('Excluded individually');
  if(policy.excludedManufacturers.includes(normalized(item.manufacturer)))reasons.push('Manufacturer exclusion');
  if(policy.excludedCategories.includes(item.category))reasons.push('Category exclusion');
  if([item.sku,item.mfgPart].some(x=>policy.excludedParts.includes(normalized(x))))reasons.push('Part / SKU exclusion');
  const text=normalized(item.description+' '+item.mfgPart+' '+item.productFamily);
  if(policy.excludedKeywords.some(k=>text.includes(k)))reasons.push('Description keyword exclusion');
  if(policy.hideAccessories&&item.category==='accessories')reasons.push('Accessories hidden');
  if(policy.newOnly&&item.condition!=='new')reasons.push('Condition not confirmed new');
  return reasons;
}
export function productAssessment(item,state,{nowMs=Date.now()}={}){
  const excluded=exclusionReasons(item,state.policy),o=item.observation,reasons=[];
  const checkedAt=Date.parse(o?.checkedAt),age=nowMs-checkedAt;
  const fresh=!!o&&Number.isFinite(checkedAt)&&age>=-30000&&age<=state.pricingPolicy.maxPriceAgeSeconds*1000;
  const bound=!!o&&o.sku===item.sku&&(!o.mfgPart||normalized(o.mfgPart)===normalized(item.mfgPart))&&o.identityMatched===true;
  const production=!!o&&o.environment==='production';
  const active=!!o&&o.status==='Active'&&!o.issues.some(x=>['inactive_or_unauthorized','product_identity_mismatch','ambiguous_product_match'].includes(x));
  const trusted=fresh&&bound&&production&&active&&!item.lastCheckFailure;
  let sellPriceCents=null,markupBps=null;
  if(!o)reasons.push('TD price / availability not checked');
  else {
    if(!fresh)reasons.push('TD observation expired');
    if(!production)reasons.push('UAT result — not production');
    if(!bound)reasons.push('Product identity needs review');
    if(!active)reasons.push('Not active / not authorized by supplier');
    if(o.currency!=='USD')reasons.push('Account currency not confirmed');
    if(o.costCents===null)reasons.push('No valid regular price');
  }
  if(item.lastCheckFailure)reasons.push('Latest lookup failed');
  if(!item.review.resaleConfirmed)reasons.push('Product resale scope not reviewed');
  if(!item.review.contentConfirmed)reasons.push('Public product content not reviewed');
  if(!item.categoryConfirmed)reasons.push('Category is approximate / unreviewed');
  if(item.condition!=='new')reasons.push('Condition is not confirmed new');
  const stock=trusted&&Number.isSafeInteger(o.stockQuantity)?o.stockQuantity:null;
  if(stock===null)reasons.push('Current production quantity unknown');else if(stock===0)reasons.push('No reported stock');
  if(o?.endUserRequired!==false)reasons.push('End-user requirement needs quote review');
  if(o?.parcelShippable!==true)reasons.push('Shipping method needs review');
  if(trusted&&o.currency==='USD'&&o.costCents!==null&&item.review.resaleConfirmed){
    try {
      const r=calculateMarketplacePrice({sku:item.sku,mfgPart:item.mfgPart,manufacturer:item.manufacturer,category:item.category,currency:'USD',distributorCostCents:o.costCents,costVerification:{verified:true,environment:'production',source:'tdsynnex-priceavailability',status:'Active',resaleAuthorized:true,pricedAt:o.checkedAt}},state.pricingPolicy,{nowMs});
      if(r.pricingHeld)reasons.push('Minimum product profit not met');else{sellPriceCents=r.sellPriceCents;markupBps=r.markupBps;}
    }catch{reasons.push('Pricing rule requires review');}
  }
  const reviewReady=!excluded.length&&!reasons.length;
  return {excluded:excluded.length>0,exclusionReasons:excluded,reviewReasons:[...new Set(reasons)],fresh,production,bound,stockQuantity:stock,stockStatus:stock===null?'unknown':stock>0?'in_stock':'out_of_stock',sellPriceCents,markupBps,
    reviewReady,internalPrice:internalPriceContext(item,state.pricingPolicy,{nowMs}),checkoutEnabled:false,published:false,notice:'Freight, tax, fees, final authorization, and checkout still require validation.'};
}
function priceFilter(x){if(x===''||x===null||x===undefined)return null;const s=String(x);if(!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(s))invalid('Invalid selling-price filter.');const [u,f='']=s.split('.');return Number(u)*100+Number(f.padEnd(2,'0'));}
export function productFilters(input={}) {
  const allowed=['q','manufacturer','category','stock','decision','condition','minPrice','maxPrice','sort','page'];
  if(!plain(input)||Object.keys(input).some(k=>!allowed.includes(k)))invalid('Invalid selection filters.');
  const f={q:productText(input.q||'','query',100,{optional:true}),manufacturer:productText(input.manufacturer||'','manufacturer',140,{optional:true}),category:input.category||'all',stock:input.stock||'any',decision:input.decision||'all',condition:input.condition||'all',minPrice:priceFilter(input.minPrice),maxPrice:priceFilter(input.maxPrice),sort:input.sort||'name',page:Number(input.page||0)};
  if(!['all',...PRODUCT_CATEGORIES].includes(f.category)||!['any','in_stock','out_of_stock','unknown'].includes(f.stock)||!['all','included','excluded','ready','review'].includes(f.decision)||!['all','unknown','new','refurbished','used'].includes(f.condition)||!['name','price_asc','price_desc','stock_desc','manufacturer'].includes(f.sort)||!Number.isInteger(f.page)||f.page<0||f.page>20||(f.minPrice!==null&&f.maxPrice!==null&&f.minPrice>f.maxPrice))invalid('Invalid selection filter value.');
  return f;
}
export function selectionPage(state,input={},options={}){
  const f=productFilters(input),all=state.items.map(item=>({...item,assessment:productAssessment(item,state,options)}));
  let items=all.filter(p=>{
    const a=p.assessment,text=normalized([p.description,p.mfgPart,p.sku,p.manufacturer].join(' '));
    return (!f.q||normalized(f.q).split(/\s+/).every(word=>text.includes(word)))&&(!f.manufacturer||normalized(p.manufacturer)===normalized(f.manufacturer))&&(f.category==='all'||p.category===f.category)&&(f.stock==='any'||a.stockStatus===f.stock)&&(f.condition==='all'||p.condition===f.condition)&&
      (f.decision==='all'||f.decision==='included'&&!a.excluded||f.decision==='excluded'&&a.excluded||f.decision==='ready'&&a.reviewReady||f.decision==='review'&&!a.excluded&&!a.reviewReady)&&
      (f.minPrice===null||a.sellPriceCents!==null&&a.sellPriceCents>=f.minPrice)&&(f.maxPrice===null||a.sellPriceCents!==null&&a.sellPriceCents<=f.maxPrice);
  });
  const nullLast=(a,b,key,dir=1)=>a[key]===null?(b[key]===null?0:1):b[key]===null?-1:(a[key]-b[key])*dir;
  items.sort((a,b)=>{
    let n=0;if(f.sort==='price_asc')n=nullLast(a.assessment,b.assessment,'sellPriceCents');else if(f.sort==='price_desc')n=nullLast(a.assessment,b.assessment,'sellPriceCents',-1);else if(f.sort==='stock_desc')n=nullLast(a.assessment,b.assessment,'stockQuantity',-1);else if(f.sort==='manufacturer')n=a.manufacturer.localeCompare(b.manufacturer);
    return n||a.description.localeCompare(b.description)||a.id.localeCompare(b.id);
  });
  const total=items.length,offset=f.page*PRODUCT_PAGE_SIZE;
  return {revision:state.revision,items:items.slice(offset,offset+PRODUCT_PAGE_SIZE),total,selectedCount:all.length,page:f.page,pageSize:PRODUCT_PAGE_SIZE,hasMore:offset+PRODUCT_PAGE_SIZE<total,
    scope:'complete-saved-selection',manufacturers:[...new Set(all.map(x=>x.manufacturer))].sort(),counts:{excluded:all.filter(x=>x.assessment.excluded).length,reviewReady:all.filter(x=>x.assessment.reviewReady).length,published:0},policy:state.policy,pricingPolicy:state.pricingPolicy};
}
export function customerProductPreview(item,assessment){
  return {id:item.id,manufacturer:item.manufacturer,partNumber:item.mfgPart,title:item.description,category:item.category,condition:item.condition,
    price:assessment.sellPriceCents===null?null:{amountCents:assessment.sellPriceCents,currency:'USD',taxAndShippingIncluded:false},availability:assessment.stockStatus,
    availableForCheckout:false,publicationStatus:'internal-review-only',quoteRequestUrl:'/contact'};
}
