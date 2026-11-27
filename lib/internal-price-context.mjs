// Administrator information only. None of these values approve publication or checkout.
import {indicativeMarkup} from './marketplace-pricing.mjs';
export function internalPriceContext(item,policy,{nowMs=Date.now()}={}){
 const o=item.observation||item.lastObservation;
 if(!o||o.identityMatched!==true||o.sku!==item.sku||String(o.mfgPart||'').toUpperCase()!==String(item.mfgPart||'').toUpperCase()||o.source!=='tdsynnex-priceavailability')return null;
 const time=Date.parse(o.checkedAt);if(!Number.isFinite(time)||time>nowMs+30000)return null;
 const fresh=nowMs-time<=(policy.maxPriceAgeSeconds??900)*1000&&!item.lastCheckFailure;
 const amount=Number.isSafeInteger(o.costCents)&&o.costCents>0?o.costCents:null;
 let indicative=null;
 if(amount!==null&&o.status==='Active'&&o.environment==='production'){
  try{indicative=indicativeMarkup({...item,distributorCostCents:amount},policy);}catch{}
 }
 return {lastAmountCents:amount,currency:o.currency==='USD'?'USD':null,currencyConfirmed:o.currency==='USD',environment:o.environment,
  checkedAt:o.checkedAt,ageSeconds:Math.max(0,Math.floor((nowMs-time)/1000)),fresh,
  status:o.status,latestCheckFailed:!!item.lastCheckFailure,
  lastReportedQuantity:Number.isSafeInteger(o.stockQuantity)&&o.stockQuantity>=0?o.stockQuantity:null,
  indicativePriceCents:indicative?.indicativePriceCents??null,markupBps:indicative?.markupBps??null,rule:indicative?.rule??null,
  notAnApprovedSellingPrice:true,internalOnly:true,includesFreightTaxOrFees:false};
}
