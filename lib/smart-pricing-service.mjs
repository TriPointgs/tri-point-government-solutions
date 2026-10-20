import {createHash} from 'node:crypto';
import {HttpError} from './model.mjs';
import {caseId} from './smart-pricing-store.mjs';
import {validateSmartPolicy,validateScenario,evaluateOrder,OWNER_FREIGHT_RULE,fields,integer} from './smart-pricing-model.mjs';
import {productAssessment} from './product-controls-model.mjs';
export function createSmartPricingService({store,products,marketStore,clock=()=>Date.now()}){
 const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 const safeCase=r=>({id:r.id,evaluatedAt:r.evaluatedAt,settingsRevision:r.settingsRevision,productRevision:r.productRevision,scenario:r.scenario,result:r.result,saved:true,notALiveQuote:true});
 return {
  async context(){const [{state:config},{state:catalog}]=await Promise.all([store.settings(),products.read()]);return {revision:config.revision,policy:config.policy,shippingRule:OWNER_FREIGHT_RULE,products:catalog.items.map(p=>({id:p.id,manufacturer:p.manufacturer,mfgPart:p.mfgPart,description:p.description,lastPrice:productAssessment(p,catalog,{nowMs:clock()}).internalPrice})),checkoutEnabled:false,autoRepricingEnabled:false};},
  async policy({revision,policy}){integer(revision,'settings revision');const validated=validateSmartPolicy(policy),{state,etag}=await store.settings();if(state.revision!==revision)throw new HttpError(409,'Pricing policy changed. Reload before saving.');const next={...state,revision:state.revision+1,policy:validated,updatedAt:new Date(clock()).toISOString()};await store.saveSettings(next,etag);return {revision:next.revision,policy:validated,checkoutEnabled:false,message:'Private scenario defaults saved. Customer prices and existing 15% markup rules were not changed.'};},
  async evaluate({id,revision,scenario}){
   id=caseId(id);integer(revision,'settings revision');const clean=validateScenario(scenario),requestHash=hash({revision,scenario:clean});const existing=await store.readCase(id);
   if(existing){if(existing.requestHash!==requestHash)throw new HttpError(409,'Use a new scenario reference for changed inputs.');return {...safeCase(existing),replayed:true};}
   const [{state:config},{state:catalog}]=await Promise.all([store.settings(),products.read()]);if(config.revision!==revision)throw new HttpError(409,'Pricing settings changed. Reload before evaluating.');
   const selected=clean.lines.map(x=>{const item=catalog.items.find(p=>p.id===x.id);if(!item)throw new HttpError(404,'A selected product is no longer saved.');return item;});
   const lines=[];for(let i=0;i<selected.length;i+=5)await Promise.all(selected.slice(i,i+5).map(async(item,n)=>{const {book}=await marketStore.read(item);lines[i+n]={item,assessment:productAssessment(item,catalog,{nowMs:clock()}),book};}));
   const result=evaluateOrder({lines,scenario:clean,policy:config.policy,markupPolicy:catalog.pricingPolicy,nowMs:clock()});
   const [{state:currentPolicy},{state:currentProducts}]=await Promise.all([store.settings(),products.read()]);
   if(currentPolicy.revision!==config.revision||currentProducts.revision!==catalog.revision)throw new HttpError(409,'Product/pricing data changed during evaluation. Calculate a new scenario.');
   const record={schemaVersion:1,mode:'preview',id,requestHash,evaluatedAt:new Date(clock()).toISOString(),settingsRevision:config.revision,productRevision:catalog.revision,scenario:clean,result};
   const stored=await store.createCase(record);return {...safeCase(stored.record),replayed:!stored.created};
  },
  async read(id){const record=await store.readCase(caseId(id));if(!record)throw new HttpError(404,'Saved scenario not found.');return safeCase(record);}
 };
}
