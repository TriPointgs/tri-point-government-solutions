// Pure administrator planning. No publication, repricing, payment, mail or supplier-order operation.
// Currency: USD integer cents. Weight: integer thousandths of a pound, including packaging.
import {HttpError} from './model.mjs';
import {indicativeMarkup} from './marketplace-pricing.mjs';
export const SMART_VERSION=1;
export const DEFAULT_SMART_POLICY=Object.freeze({undercutBps:50,minMarginBps:500,minProfitCents:500,capAtBaseMarkup:true,settingsConfirmed:false});
export const OWNER_FREIGHT_RULE=Object.freeze({minimumExclusiveCents:100000,maximumExclusiveWeightMilliLb:100000,basis:'TD acquisition merchandise subtotal, excluding tax and fees',source:'Owner-reported account terms, October 20 2026',thresholdBasis:'Conservative implementation assumption: distributor purchase subtotal, not customer selling price'});
const fail=m=>{throw new HttpError(400,m);};
export const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
export function fields(obj,allowed,label){if(!isRecord(obj)||Object.keys(obj).some(k=>!allowed.includes(k)))fail('Invalid '+label+' fields.');return obj;}
export function integer(value,name,min=0,max=1000000000){if(!Number.isSafeInteger(value)||value<min||value>max)fail('Invalid '+name+'.');return value;}
export function bool(value,name){if(typeof value!=='boolean')fail('Confirm '+name+'.');return value;}
export function shortText(value,name,max=200,empty=false){if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value)||(!empty&&!value.trim()))fail('Invalid '+name+'.');return value.trim();}
export function validateSmartPolicy(value=DEFAULT_SMART_POLICY){fields(value,['undercutBps','minMarginBps','minProfitCents','capAtBaseMarkup','settingsConfirmed'],'smart pricing policy');return {undercutBps:integer(value.undercutBps,'undercut',0,1000),minMarginBps:integer(value.minMarginBps,'minimum contribution margin',0,5000),minProfitCents:integer(value.minProfitCents,'minimum contribution profit',1,10000000),capAtBaseMarkup:bool(value.capAtBaseMarkup,'base markup cap'),settingsConfirmed:bool(value.settingsConfirmed,'draft policy confirmation')};}
const ceilDiv=(a,b)=>(a+b-1n)/b;
const centsNumber=n=>{if(n>100000000000n||n<0n)fail('Scenario exceeds supported money limits.');return Number(n);};
const fee=(c,bps)=>centsNumber(ceilDiv(BigInt(c)*BigInt(bps),10000n));
export function allocateCents(total,weights){integer(total,'allocation amount',0,100000000000);if(!Array.isArray(weights)||!weights.length||weights.length>20)fail('Invalid allocation weights.');for(const w of weights)integer(w,'allocation weight',1,100000000000);const sum=weights.reduce((s,w)=>s+BigInt(w),0n),t=BigInt(total);const a=weights.map((w,i)=>({i,base:t*BigInt(w)/sum,remainder:t*BigInt(w)%sum}));let left=t-a.reduce((s,x)=>s+x.base,0n);for(const x of [...a].sort((x,y)=>x.remainder===y.remainder?x.i-y.i:x.remainder>y.remainder?-1:1)){if(left===0n)break;x.base++;left--;}return a.map(x=>centsNumber(x.base));}
export function freightEstimate({subtotalCents,totalWeightMilliLb,oneSupplierOrder=true,accountRuleApplicable=false,quotedFreightCents=null,quoteConfirmed=false}){
 integer(subtotalCents,'TD merchandise subtotal',0,100000000000);if(totalWeightMilliLb!==null)integer(totalWeightMilliLb,'total shipping weight',0,100000000);bool(oneSupplierOrder,'single TD purchase order');bool(accountRuleApplicable,'shipping-rule scope');bool(quoteConfirmed,'freight quote');if(quotedFreightCents!==null)integer(quotedFreightCents,'freight quote');
 const threshold=subtotalCents>OWNER_FREIGHT_RULE.minimumExclusiveCents,weight=totalWeightMilliLb!==null&&totalWeightMilliLb>0&&totalWeightMilliLb<OWNER_FREIGHT_RULE.maximumExclusiveWeightMilliLb;
 const eligible=oneSupplierOrder&&accountRuleApplicable&&threshold&&weight;
 const base={...OWNER_FREIGHT_RULE,subtotalCents,totalWeightMilliLb,thresholdMet:threshold,weightMet:weight,ruleEligible:eligible,oneSupplierOrder,accountRuleApplicable,checkoutShippingPromise:false};
 if(quotedFreightCents!==null&&quoteConfirmed)return {...base,costCents:quotedFreightCents,status:'confirmed-quote',explanation:'Explicit reviewed freight quote overrides the account-rule estimate.'};
 if(eligible)return {...base,costCents:0,status:'owner-rule-estimate',explanation:'Over $1,000 TD merchandise cost and under 100 lb on one eligible supplier order. Owner-reported rule applied; final shipment validation remains required.'};
 return {...base,costCents:null,status:'quote-required',explanation:!oneSupplierOrder?'Multiple/split supplier orders: do not pool them to qualify.':!accountRuleApplicable?'Account shipping-rule scope has not been reviewed for this order.':!threshold?'Supplier merchandise subtotal must be strictly greater than $1,000.':totalWeightMilliLb===null?'Complete packaged shipping weight is missing.':'Packaged shipping weight must be positive and strictly less than 100 lb.'};
}
export function validateScenario(value){
 fields(value,['lines','destinationZip','oneSupplierOrder','accountRuleApplicable','quotedFreightCents','quoteConfirmed','paymentFeeBps','paymentFixedCents','adminFeeBps','reserveBps','handlingCents','otherCostCents','extraPaymentBaseCents','customerShippingCents','costInputsConfirmed'],'scenario');
 if(!Array.isArray(value.lines)||value.lines.length<1||value.lines.length>20)fail('Choose 1–20 product lines.');
 const seen=new Set(),lines=value.lines.map(x=>{fields(x,['id','quantity','unitWeightMilliLb','weightConfirmed','advertisingReview','mapCents','mapEvidence','embargoed'],'scenario line');
 if(typeof x.id!=='string'||!/^TD-[1-9]\d{0,11}$/.test(x.id)||seen.has(x.id))fail('Select unique saved product IDs.');seen.add(x.id);
 if(!['unreviewed','no-map','map'].includes(x.advertisingReview))fail('Select a pricing-restriction review state.');
 const map=x.mapCents===null?null:integer(x.mapCents,'minimum advertised unit price',1);
 if(x.advertisingReview==='map'&&map===null)fail('Enter the reviewed MAP amount.');
 const evidence=shortText(x.mapEvidence??'','pricing-review reference',240,true);if(x.advertisingReview!=='unreviewed'&&evidence.length<8)fail('Record a source/date reference for the manufacturer-pricing review.');
 return {id:x.id,quantity:integer(x.quantity,'quantity',1,10000),unitWeightMilliLb:x.unitWeightMilliLb===null?null:integer(x.unitWeightMilliLb,'packaged unit weight',1,100000000),weightConfirmed:bool(x.weightConfirmed,'weight review'),advertisingReview:x.advertisingReview,mapCents:map,mapEvidence:evidence,embargoed:bool(x.embargoed,'embargo status')};});
 if(!/^\d{5}$/.test(value.destinationZip||''))fail('Enter a five-digit US destination ZIP.');
 const result={...value,lines};for(const k of ['oneSupplierOrder','accountRuleApplicable','quoteConfirmed','costInputsConfirmed'])result[k]=bool(value[k],k);
 for(const k of ['paymentFeeBps','adminFeeBps','reserveBps'])result[k]=value[k]===null?null:integer(value[k],k,0,3000);
 for(const k of ['quotedFreightCents','paymentFixedCents','handlingCents','otherCostCents','extraPaymentBaseCents','customerShippingCents'])result[k]=value[k]===null?null:integer(value[k],k);
 if((result.paymentFeeBps??0)+(result.adminFeeBps??0)+(result.reserveBps??0)>=8000)fail('Combined variable cost rate is outside supported bounds.');
 return result;
}
export function eligibleUSOffers(book,item,destinationZip,{nowMs=Date.now()}={}){
 const key=x=>String(x||'').trim().toUpperCase();
 const bound=book?.productId===item.id&&book.identity?.manufacturer===key(item.manufacturer)&&book.identity?.mfgPart===key(item.mfgPart);
 const rows=(book?.offers||[]).map(o=>{const reasons=[];
 if(!bound||key(o.manufacturer)!==key(item.manufacturer)||key(o.mfgPart)!==key(item.mfgPart))reasons.push('Product mismatch');
 if(o.collection!=='manual-reviewed')reasons.push('Not a reviewed retailer offer');
 if(o.sellerCountry!=='US'||o.shipsFromCountry!=='US'||o.usSourceReviewed!==true||typeof o.usSourceEvidence!=='string'||o.usSourceEvidence.trim().length<8)reasons.push('US seller and US fulfillment not reviewed');
 if(o.currency!=='USD')reasons.push('USD not confirmed');
 if(o.condition!=='new'||o.quantity!==1||o.bundle)reasons.push('Not a new unbundled single unit');
 if(o.availability!=='in_stock')reasons.push('Inventory not confirmed');
 if(o.publicPrice!==true||o.configurationConfirmed!==true||o.sellerReviewed!==true)reasons.push('Public price/configuration/seller review incomplete');
 if(o.destinationZip!==destinationZip)reasons.push('Different delivery ZIP');
 const age=nowMs-Date.parse(o.observedAt);if(!Number.isFinite(age)||age< -30000||age>86400000)reasons.push('Offer older than 24 hours or invalid time');
 if(!Number.isSafeInteger(o.itemPriceCents)||o.itemPriceCents<=0)reasons.push('Missing item price');
 if(!Number.isSafeInteger(o.shippingCents)||o.shippingCents<0)reasons.push('Delivery charge unknown');
 return {...o,reasons,eligible:false,deliveredUnitCents:!reasons.length?o.itemPriceCents+o.shippingCents:null};});
 const sellers=new Set(),retailers=new Set();for(const r of [...rows].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))){if(r.reasons.length)continue;const s=String(r.sellerGroup||'').trim().toLowerCase();if(!s||sellers.has(s)||retailers.has(r.retailer)){r.reasons.push('Duplicate or unknown seller');continue;}sellers.add(s);retailers.add(r.retailer);r.eligible=true;}
 const eligible=rows.filter(r=>r.eligible),prices=eligible.map(r=>r.deliveredUnitCents);
 const sum=prices.reduce((s,p)=>s+BigInt(p),0n);
 return {basis:'One new in-stock unit delivered to the same US ZIP, before sales tax',count:prices.length,lowestCents:prices.length?Math.min(...prices):null,averageCents:prices.length>=2?Number((sum+BigInt(Math.floor(prices.length/2)))/BigInt(prices.length)):null,rows};
}
export function lineEconomics(unitPriceCents,line,costs){
 integer(unitPriceCents,'unit selling price',1);const merchandise=centsNumber(BigInt(unitPriceCents)*BigInt(line.quantity)),revenue=merchandise+costs.customerShippingCents;
 const acquisition=centsNumber(BigInt(line.unitCostCents)*BigInt(line.quantity));
 const payment=fee(revenue+costs.extraPaymentBaseCents,costs.paymentFeeBps)+costs.paymentFixedCents;
 const admin=fee(merchandise,costs.adminFeeBps),reserve=fee(merchandise,costs.reserveBps);
 const totalCost=acquisition+costs.freightCents+costs.handlingCents+costs.otherCostCents+payment+admin+reserve;
 const profit=revenue-totalCost;
 return {unitPriceCents,quantity:line.quantity,merchandiseCents:merchandise,revenueCents:revenue,acquisitionCents:acquisition,freightCents:costs.freightCents,handlingCents:costs.handlingCents,otherCostCents:costs.otherCostCents,paymentFeeCents:payment,adminFeeCents:admin,riskReserveCents:reserve,customerShippingCents:costs.customerShippingCents,totalCostCents:totalCost,contributionProfitCents:profit,contributionMarginBps:Math.floor(profit*10000/revenue),excludesIncomeTaxAndUnmodeledOverhead:true};
}
export function minimumUnitPrice(line,costs,policy){
 const passes=p=>{const e=lineEconomics(p,line,costs);return e.contributionProfitCents>=Math.max(1,costs.minimumProfitCents)&&BigInt(e.contributionProfitCents)*10000n>=BigInt(e.revenueCents)*BigInt(policy.minMarginBps);};
 let low=1,high=Math.min(1000000000,Math.floor(100000000000/line.quantity));if(!passes(high))return null;
 while(low<high){const middle=Math.floor((low+high)/2);if(passes(middle))high=middle;else low=middle+1;}
 return low;
}
export function recommendLine(line,costs,policy,benchmark,baseMarkupCents){
 const contributionFloor=minimumUnitPrice(line,costs,policy);if(contributionFloor===null)return {decision:'no-safe-price',recommendedUnitCents:null,attempts:[]};
 const floor=Math.max(contributionFloor,line.mapCents||0),attempts=[],limit=Math.min(1000000000,Math.floor(100000000000/line.quantity));if(floor>limit)return {decision:'no-safe-price',recommendedUnitCents:null,attempts:[]};
 for(const [basis,value]of [['lowest',benchmark.lowestCents],['average',benchmark.averageCents]]){
  if(value===null)continue;
  const maxUnit=Math.min(limit,Math.floor((value*line.quantity-costs.customerShippingCents)/line.quantity));
  const desiredDelivered=Number(BigInt(value)*BigInt(10000-policy.undercutBps)/10000n);
  const desiredUnit=Math.floor((desiredDelivered*line.quantity-costs.customerShippingCents)/line.quantity);
  if(maxUnit<floor){attempts.push({basis,benchmarkUnitDeliveredCents:value,outcome:'below-profitable-or-MAP-floor',maximumMatchUnitCents:maxUnit,floorUnitCents:floor});continue;}
  let candidate=Math.max(floor,desiredUnit);if(policy.capAtBaseMarkup)candidate=Math.min(candidate,Math.max(floor,baseMarkupCents));
  candidate=Math.max(floor,Math.min(candidate,maxUnit));
  const economics=lineEconomics(candidate,line,costs);const total= economics.merchandiseCents+costs.customerShippingCents;
  const relation=total<value*line.quantity?'undercut':'match';
  attempts.push({basis,benchmarkUnitDeliveredCents:value,outcome:relation,candidateUnitCents:candidate});
  return {decision:basis+'-'+relation,recommendedUnitCents:candidate,contributionFloorUnitCents:contributionFloor,protectedFloorUnitCents:floor,baseMarkupUnitCents:baseMarkupCents,benchmarkUnitDeliveredCents:value,economics,attempts,averageFallbackDoesNotBeatLowest:basis==='average'};
 }
 const fallback=Math.max(floor,baseMarkupCents);if(fallback>limit)return {decision:'no-safe-price',recommendedUnitCents:null,attempts};
 return {decision:benchmark.count?'uncompetitive-review':'cost-plus-no-comparable-market',recommendedUnitCents:benchmark.count?null:fallback,referenceUnitCents:fallback,contributionFloorUnitCents:contributionFloor,protectedFloorUnitCents:floor,baseMarkupUnitCents:baseMarkupCents,economics:lineEconomics(fallback,line,costs),attempts,averageFallbackDoesNotBeatLowest:false};
}
export function evaluateOrder({lines,scenario,policy:policyInput,markupPolicy,nowMs=Date.now()}){
 const policy=validateSmartPolicy(policyInput),input=validateScenario(scenario);if(lines.length!==input.lines.length)fail('Scenario products do not match the saved selection.');
 const holds=[],prepared=lines.map(({item,assessment,book},i)=>{
  const spec=input.lines[i];if(item.id!==spec.id)fail('Scenario product order mismatch.');
  const p=assessment.internalPrice,o=item.observation;
  if(!p||p.lastAmountCents===null){holds.push(item.mfgPart+': no matched TD price');return {item,assessment,book,spec,unitCostCents:null};}
  if(p.environment!=='production'||!p.fresh||p.latestCheckFailed||p.status!=='Active')holds.push(item.mfgPart+': refresh TD production pricing');
  if(!p.currencyConfirmed)holds.push(item.mfgPart+': confirm TD account currency as USD');
  if(!item.review?.resaleConfirmed||!item.review?.contentConfirmed||item.condition!=='new'||!item.categoryConfirmed)holds.push(item.mfgPart+': complete product/resale/content/condition review');
  if(assessment.excluded)holds.push(item.mfgPart+': excluded from selection');
  if(assessment.stockQuantity===null||assessment.stockQuantity<spec.quantity)holds.push(item.mfgPart+': insufficient verified TD stock');
  if(o?.endUserRequired!==false)holds.push(item.mfgPart+': end-user requirements need review');
  if(o?.parcelShippable!==true)holds.push(item.mfgPart+': shipping method needs review');
  if(spec.advertisingReview==='unreviewed')holds.push(item.mfgPart+': manufacturer advertising restrictions unreviewed');
  if(spec.embargoed)holds.push(item.mfgPart+': embargo/restricted-price hold');
  return {item,assessment,book,spec,unitCostCents:p.lastAmountCents};
 });
 if(!policy.settingsConfirmed)holds.push('Proposed profit/undercut settings not yet confirmed by an administrator');
 if(!input.costInputsConfirmed)holds.push('Fee, reserve, tax-related processing base and handling inputs not confirmed');
 if(prepared.some(l=>l.unitCostCents===null))return {status:'missing-td-cost',recommendedOrderCents:null,holds,lines:[],privateOnly:true,checkoutEnabled:false,publicPriceChanged:false};
 const weights=prepared.map(l=>centsNumber(BigInt(l.unitCostCents)*BigInt(l.spec.quantity))),subtotal=weights.reduce((a,b)=>a+b,0);
 const weightKnown=prepared.every(l=>l.spec.weightConfirmed&&l.spec.unitWeightMilliLb!==null);
 const totalWeight=weightKnown?prepared.reduce((s,l)=>s+l.spec.unitWeightMilliLb*l.spec.quantity,0):null;
 const freight=freightEstimate({subtotalCents:subtotal,totalWeightMilliLb:totalWeight,oneSupplierOrder:input.oneSupplierOrder,accountRuleApplicable:input.accountRuleApplicable,quotedFreightCents:input.quotedFreightCents,quoteConfirmed:input.quoteConfirmed});
 const required=['paymentFeeBps','paymentFixedCents','adminFeeBps','reserveBps','handlingCents','otherCostCents','extraPaymentBaseCents','customerShippingCents'];
 const missing=required.filter(k=>input[k]===null);if(freight.costCents===null)missing.push('supplierFreightCents');
 const offers=prepared.map(l=>eligibleUSOffers(l.book,l.item,input.destinationZip,{nowMs}));
 if(missing.length)return {status:'missing-order-costs',recommendedOrderCents:null,holds:[...holds,...missing.map(k=>'Enter '+k+' (zero only when explicitly known)')],freight,tdSubtotalCents:subtotal,totalWeightMilliLb:totalWeight,lines:prepared.map((l,i)=>({id:l.item.id,mfgPart:l.item.mfgPart,benchmark:offers[i]})),privateOnly:true,checkoutEnabled:false,publicPriceChanged:false};
 const allocation={freightCents:allocateCents(freight.costCents,weights)};
 for(const k of ['paymentFixedCents','handlingCents','otherCostCents','extraPaymentBaseCents','customerShippingCents'])allocation[k]=allocateCents(input[k],weights);
 allocation.minimumProfitCents=allocateCents(policy.minProfitCents,weights);
 const output=prepared.map((l,i)=>{const costs={paymentFeeBps:input.paymentFeeBps,adminFeeBps:input.adminFeeBps,reserveBps:input.reserveBps};for(const [k,a]of Object.entries(allocation))costs[k]=a[i];
  const base=indicativeMarkup({...l.item,distributorCostCents:l.unitCostCents},markupPolicy).indicativePriceCents;
  const result=recommendLine({unitCostCents:l.unitCostCents,quantity:l.spec.quantity,mapCents:l.spec.advertisingReview==='map'?l.spec.mapCents:0},costs,policy,offers[i],base);
  return {id:l.item.id,mfgPart:l.item.mfgPart,quantity:l.spec.quantity,weightMilliLb:l.spec.unitWeightMilliLb,benchmark:offers[i],costAllocation:costs,...result};});
 const noRecommendation=output.some(l=>l.recommendedUnitCents===null);if(noRecommendation)holds.push('At least one product cannot match the lowest/average benchmark above its protected floor');
 const totals={};for(const k of ['merchandiseCents','revenueCents','acquisitionCents','freightCents','handlingCents','otherCostCents','paymentFeeCents','adminFeeCents','riskReserveCents','customerShippingCents','totalCostCents','contributionProfitCents'])totals[k]=output.reduce((s,l)=>s+(l.economics?.[k]||0),0);
 totals.contributionMarginBps=totals.revenueCents?Math.floor(totals.contributionProfitCents*10000/totals.revenueCents):null;
 return {status:holds.length?'analysis-with-holds':'ready-for-internal-quote-review',recommendedOrderCents:noRecommendation?null:totals.revenueCents,totalsAreReferenceOnly:noRecommendation,
  totals,freight,tdSubtotalCents:subtotal,totalWeightMilliLb:totalWeight,lines:output,holds:[...new Set(holds)],policy,
  costBasis:'USD scenario. Contribution profit after entered acquisition, freight, handling, payment/admin costs and reserve; not net income. Percentage costs rounded up per line.',
  customerShippingPolicy:'Customer shipping charge is independent of TD free freight. No public free-shipping promise is made.',privateOnly:true,checkoutEnabled:false,publicPriceChanged:false,autoPurchaseEnabled:false};
}
