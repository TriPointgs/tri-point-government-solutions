import {createShoppingCollector} from './serpapi-shopping.mjs';
import {createMarketPriceService} from './market-price-service.mjs';
import {createMarketPriceStore} from './market-price-store.mjs';
import {HttpError} from './model.mjs';
import {catalogQuery,catalogConfig,searchPrivateCatalog} from './catalog-remote.mjs';
import {createTdReadonly,TdReadError} from './tdsynnex-readonly.mjs';
import {validatePricingPolicy} from './marketplace-pricing.mjs';
import {candidateFromSnapshot,mergeCandidates,productId,validProductId,validateExclusions,selectionPage,reviewProduct,customerProductPreview,productAssessment,PRODUCT_LIMIT} from './product-controls-model.mjs';
import {createProductWorkspaceStore} from './product-controls-store.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function sourceQuery(input){
  if(!object(input)||Object.keys(input).some(k=>!['q','maker','category','exact','page'].includes(k)))throw new HttpError(400,'Invalid source query.');
  const p=new URLSearchParams();for(const [k,v]of Object.entries(input))p.set(k,String(v));
  const q=catalogQuery(p);if(!q.q&&!q.maker)throw new HttpError(400,'Enter a product keyword, part number, or manufacturer.');return q;
}
export function createProductControls({env=process.env,store=createProductWorkspaceStore({env}),catalog=query=>searchPrivateCatalog(query,{env}),td=createTdReadonly({env}),clock=()=>Date.now(),sourceLabel='private-td-snapshot',marketStore=createMarketPriceStore({env}),shopping=createShoppingCollector({env})}={}) {
  const now=()=>new Date(clock()).toISOString();
  async function current(expectedRevision){const saved=await store.read();if(expectedRevision!==saved.state.revision)throw new HttpError(409,'The saved selection changed. Refresh before trying again.');return saved;}
  async function commit(state,etag,event,count=0){state.revision++;state.updatedAt=now();state.history=[...state.history,{event,at:state.updatedAt,count}].slice(-100);await store.save(state,etag);return state;}
  function ids(input,max=20){if(!Array.isArray(input)||input.length<1||input.length>max||new Set(input).size!==input.length)throw new HttpError(400,'Choose 1–'+max+' unique saved products.');return input.map(validProductId);}
  const market=createMarketPriceService({store:marketStore,clock,product:async id=>{validProductId(id);const {state}=await store.read();const item=state.items.find(p=>p.id===id);if(!item)throw new HttpError(404,'Saved product not found.');return {item,assessment:productAssessment(item,state,{nowMs:clock()})};}});
  return {
    shoppingStatus:()=>shopping.status(),
    async marketSearch({id}){validProductId(id);const {state}=await store.read();const p=state.items.find(x=>x.id===id);if(!p)throw new HttpError(404,'Saved product not found.');return shopping.search(p);},
    marketRead:(id,zip)=>market.read(id,zip),
    marketSave:input=>market.save(input),
    marketRemove:input=>market.remove(input),
    configuration(){return {environment:env.VERCEL_ENV==='production'?'production':'preview',sourceConfigured:!!catalogConfig(env),sourceLabel,td:td.configuration(),selectionLimit:PRODUCT_LIMIT,checkoutEnabled:false,publishingEnabled:false};},
    async list(filters){const {state}=await store.read();return {...selectionPage(state,filters,{nowMs:clock()}),configuration:this.configuration()};},
    async source(input){
      const query=sourceQuery(input),data=await catalog(query),at=now(),items=[];let unusable=0;
      for(const raw of data.items){try{items.push(candidateFromSnapshot(raw,{query,at,snapshotDate:data.snapshotDate}));}catch{unusable++;}}
      const counts=new Map();for(const i of items)counts.set(i.id,(counts.get(i.id)||0)+1);
      const unique=items.filter(x=>counts.get(x.id)===1);unusable+=items.length-unique.length;
      return {items:unique.map(({observation,review,lastCheckFailure,...item})=>item),unusable,hasMore:data.hasMore,page:query.page,scope:'one-distributor-search-page',categoryApproximate:true,source:sourceLabel,
        message:'Descriptions and identities come from the imported snapshot. Price and stock have not been verified by this search.'};
    },
    async import({query:input,selections,revision}){
      if(!Array.isArray(selections)||!selections.length||selections.length>50)throw new HttpError(400,'Select 1–50 source rows.');
      const selected=selections.map(s=>{if(!object(s)||Object.keys(s).some(k=>!['sku','mfgPart'].includes(k)))throw new HttpError(400,'Invalid source selection.');return {id:productId(s.sku),sku:String(s.sku),mfgPart:s.mfgPart};});
      if(new Set(selected.map(x=>x.id)).size!==selected.length)throw new HttpError(400,'Duplicate source selections.');
      const {state,etag}=await current(revision),query=sourceQuery(input),page=await catalog(query),at=now();
      const candidates=selected.map(s=>{
        const matches=page.items.filter(i=>String(i.distributorId)===s.sku);
        if(matches.length!==1||matches[0].mfgPart!==s.mfgPart)throw new HttpError(409,'Source results changed or are ambiguous. Search again before importing.');
        return candidateFromSnapshot(matches[0],{query,at,snapshotDate:page.snapshotDate});
      });
      const merged=mergeCandidates(state,candidates);await commit(merged.state,etag,'source-import',candidates.length);
      return {revision:merged.state.revision,added:merged.added.length,updated:merged.updated.length,published:0,message:'Products saved as private drafts. No products were published and no order was placed.'};
    },
    async rules({policy,pricingPolicy,revision}){
      if(!object(pricingPolicy))throw new HttpError(400,'Provide the complete pricing policy when saving rules.');
      const valid=validateExclusions(policy);let pricing;
      try{pricing=JSON.parse(JSON.stringify(validatePricingPolicy(pricingPolicy)));}catch{throw new HttpError(400,'Invalid markup policy. Use whole basis points and valid overrides.');}
      const {state,etag}=await current(revision);state.policy=valid;state.pricingPolicy=pricing;await commit(state,etag,'filter-rules-updated');
      return {revision:state.revision,message:'Selection rules saved. The supplier catalog itself was not altered.'};
    },
    async review({id,patch,revision}){
      validProductId(id);const {state,etag}=await current(revision),index=state.items.findIndex(x=>x.id===id);if(index<0)throw new HttpError(404,'Saved product not found.');
      state.items[index]=reviewProduct(state.items[index],patch,now());await commit(state,etag,'product-review',1);return {revision:state.revision,message:'Private product review saved. Publishing and checkout remain disabled.'};
    },
    async refresh({productIds,revision}){
      const selected=ids(productIds,20),{state,etag}=await current(revision);const items=selected.map(id=>{const i=state.items.find(x=>x.id===id);if(!i)throw new HttpError(404,'Saved product not found.');return i;});
      if(!td.configuration().enabled)throw new HttpError(503,'TD read-only API credentials or approvals are not configured. See connection setup.');
      let observations,failure=null;
      try{observations=await td.lookup(items.map(i=>({sku:i.sku})));if(!Array.isArray(observations)||observations.length!==items.length)throw Error('Invalid result count');}
      catch(e){failure={code:e instanceof TdReadError?e.code:'lookup_failed',at:now()};}
      for(let n=0;n<items.length;n++){
        if(failure){items[n].observation=null;items[n].lastCheckFailure=failure;continue;}
        const o=observations[n];
        if(!o.identityMatched||o.sku!==items[n].sku||o.mfgPart&&o.mfgPart.toUpperCase()!==items[n].mfgPart.toUpperCase()){
          items[n].observation=null;items[n].lastCheckFailure={code:'identity_mismatch',at:now()};
        }else{items[n].observation=o;items[n].lastCheckFailure=null;}
      }
      await commit(state,etag,failure?'td-lookup-failed':'td-readonly-check',items.length);
      const failed=items.filter(i=>!!i.lastCheckFailure).length;
      return {revision:state.revision,checked:items.length-failed,failed,environment:td.configuration().environment,
        message:failure?'TD lookup failed ('+failure.code+'). Previous observations for these items were cleared.':`Read-only ${td.configuration().environment} checks saved. Product status, resale scope, freight and checkout are separate checks.`,ordersPlaced:0};
    },
    async customerPreview(id){const {state}=await store.read();const item=state.items.find(x=>x.id===validProductId(id));if(!item)throw new HttpError(404,'Product not found.');return customerProductPreview(item,productAssessment(item,state,{nowMs:clock()}));}
  };
}
