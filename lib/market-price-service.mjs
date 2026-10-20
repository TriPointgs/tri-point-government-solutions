import {HttpError} from './model.mjs';
import {blankMarketBook,marketIdentity,marketSummary,validateMarketOffer,RETAILERS} from './market-price.mjs';
export function createMarketPriceService({store,product,clock=()=>Date.now()}){
 async function data(id){const p=await product(id);const saved=await store.read(p.item);return {...p,...saved};}
 function render(d,zip){return {product:{id:d.item.id,manufacturer:d.item.manufacturer,mfgPart:d.item.mfgPart,description:d.item.description},revision:d.book.revision,
   tdCost:d.assessment.internalPrice?{amountCents:d.assessment.internalPrice.lastAmountCents,currency:d.assessment.internalPrice.currency,environment:d.assessment.internalPrice.environment,checkedAt:d.assessment.internalPrice.checkedAt,fresh:d.assessment.internalPrice.fresh}:null,
   internalPrice:d.assessment.internalPrice??null,
   suggestedPriceCents:d.assessment.sellPriceCents,summary:marketSummary(d.book,d.item,{nowMs:clock(),destinationZip:zip,suggestedPriceCents:d.assessment.sellPriceCents}),
   retailers:RETAILERS.map(r=>({id:r.id,name:r.name,researchUrl:r.search(d.item.mfgPart)})),collectionStatus:'Manual reviewed observations. No retailer API or automatic collection is connected.'};}
 return {async read(id,zip=''){return render(await data(id),zip);},
  async save({id,revision,offer,destinationZip}){const d=await data(id);if(revision!==d.book.revision)throw new HttpError(409,'Comparison changed. Refresh before saving.');const clean=validateMarketOffer(offer,d.item,{nowMs:clock()});
   marketSummary(d.book,d.item,{destinationZip,nowMs:clock()});const identity=marketIdentity(d.item);
   const changed=d.book.identity.manufacturer!==identity.manufacturer||d.book.identity.mfgPart!==identity.mfgPart;
   const next=changed?{...blankMarketBook(d.item),revision:d.book.revision,history:d.book.history}:structuredClone(d.book);
   const prior=next.offers.find(x=>x.retailer===clean.retailer);if(prior&&Date.parse(clean.observedAt)<Date.parse(prior.observedAt))throw new HttpError(409,'Do not replace a newer retailer observation with an older one.');
   if(prior&&Object.entries(clean).every(([k,v])=>k==='recordedAt'||prior[k]===v))return render(d,destinationZip);
   next.offers=next.offers.filter(x=>x.retailer!==clean.retailer);next.offers.push(clean);next.revision++;next.history=[...next.history,{type:'retailer-observation',retailer:clean.retailer,at:new Date(clock()).toISOString()}].slice(-40);await store.save(next,d.etag);return render({...d,book:next},destinationZip);},
  async remove({id,revision,retailer,destinationZip}){if(!RETAILERS.some(r=>r.id===retailer))throw new HttpError(400,'Unsupported retailer.');const d=await data(id);if(revision!==d.book.revision)throw new HttpError(409,'Comparison changed. Refresh before removing.');marketSummary(d.book,d.item,{destinationZip,nowMs:clock()});if(!d.book.offers.some(o=>o.retailer===retailer))return render(d,destinationZip);
   const next=structuredClone(d.book);next.offers=next.offers.filter(o=>o.retailer!==retailer);next.revision++;next.history=[...next.history,{type:'retailer-observation-removed',retailer,at:new Date(clock()).toISOString()}].slice(-40);await store.save(next,d.etag);return render({...d,book:next},destinationZip);}
 };
}
