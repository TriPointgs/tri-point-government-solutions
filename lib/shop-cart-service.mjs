import {createCachedContent} from './product-content-cache.mjs';
import {createCheckoutStore,validateCheckout,checkoutFingerprint,checkoutView,checkoutFault} from './checkout-draft.mjs';
import {launchReadiness} from './launch-readiness.mjs';
import {createIcecatContent} from './icecat-content.mjs';
import {browsePrivateInventory,inventoryQuery} from './catalog-inventory-remote.mjs';
import {HttpError} from './model.mjs';
import {catalogQuery,searchPrivateCatalog} from './catalog-remote.mjs';
import {candidateFromSnapshot,exclusionReasons,productAssessment} from './product-controls-model.mjs';
import {createProductWorkspaceStore} from './product-controls-store.mjs';
import {createSmartStore} from './smart-pricing-store.mjs';
import {createMarketPriceStore} from './market-price-store.mjs';
import {createCartStore} from './shop-cart-store.mjs';
import {createTdReadonly} from './tdsynnex-readonly.mjs';
import {indicativeMarkup} from './marketplace-pricing.mjs';
import {evaluateOrder} from './smart-pricing-model.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sku=x=>{if(typeof x!=='string'||!/^[1-9]\d{0,11}$/.test(x))throw new HttpError(400,'Invalid product.');return x;};
const quantity=x=>{if(!Number.isSafeInteger(x)||x<1||x>9999)throw new HttpError(400,'Choose a quantity between 1 and 9999.');return x;};
const card=item=>({sku:item.sku,manufacturer:item.manufacturer,title:item.description,partNumber:item.mfgPart,category:item.category||'unknown'});
const zero=()=>({items:[],subtotalCents:0,deliveryEstimateCents:null,estimatedTotalBeforeTaxCents:null,checkedAt:null,validUntil:null,status:'empty',deliveryStatus:'needs-destination',customerNotice:null,internalIssues:[]});
function matched(item,o){return o?.source==='tdsynnex-priceavailability'&&o.environment==='production'&&o.identityMatched===true&&o.sku===item.sku&&o.mfgPart?.toUpperCase()===item.mfgPart.toUpperCase()&&o.status==='Active'&&o.priceType==='REGULAR'&&!o.issues?.includes('inactive_or_unauthorized');}
function fresh(o,now){const t=Date.parse(o?.checkedAt);return Number.isFinite(t)&&t<=now+30000&&now-t<=900000;}
export function customerCart(cart,{nowMs=Date.now()}={}){
 const q=cart.quote||zero(),until=Date.parse(q.validUntil),checked=Date.parse(q.checkedAt),expired=cart.lines.length>0&&(!Number.isFinite(until)||!Number.isFinite(checked)||checked>nowMs+30000||until<=nowMs||until>checked+900000);
 const visible=cart.lines.map(line=>{const v=q.items.find(i=>i.sku===line.item.sku);return {...card(line.item),quantity:line.quantity,unitPriceCents:expired?null:v?.unitPriceCents??null,lineTotalCents:expired?null:v?.lineTotalCents??null,currency:expired?null:v?.currency??null,availability:expired?'checking':v?.availability||'checking',message:expired?'Refreshing current price and availability…':v?.message||'Checking current price and availability…'};});
 return {revision:cart.revision,zip:cart.zip,items:visible,itemCount:cart.lines.reduce((n,l)=>n+l.quantity,0),subtotalCents:expired?null:q.subtotalCents,deliveryEstimateCents:expired?null:q.deliveryEstimateCents,estimatedTotalBeforeTaxCents:expired?null:q.estimatedTotalBeforeTaxCents,taxCents:null,totalCents:null,
  status:expired?'expired':q.status,deliveryStatus:expired?'checking':q.deliveryStatus,checkedAt:q.checkedAt,validUntil:q.validUntil,needsRefresh:cart.lines.length>0&&(expired||!q.checkedAt),
  notice:expired?'Prices are being refreshed.':q.customerNotice,checkoutEnabled:false,preview:true,paymentCollected:false,orderPlaced:false};
}
export function createShopService({env=process.env,products=createProductWorkspaceStore({env}),cartStore=createCartStore({env}),td=createTdReadonly({env}),catalog=q=>searchPrivateCatalog(q,{env}),marketStore=createMarketPriceStore({env}),settings=createSmartStore({env}),clock=()=>Date.now(),inventoryBrowse=q=>browsePrivateInventory(q,{env}),content=createCachedContent({provider:createIcecatContent({env}),env}),checkoutStore=createCheckoutStore({env})}={}){
 const finalizationSources=new WeakSet();
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Shopping has not been released.');};
 async function resolve(s,state){const existing=state.items.find(p=>p.sku===s);if(existing)return structuredClone(existing);
  const query={q:s,maker:'',category:'all',exact:true,page:0},result=await catalog(query),rows=result.items.filter(i=>String(i.distributorId)===s);if(rows.length!==1)throw new HttpError(409,'That product is no longer available in the catalog.');
  return candidateFromSnapshot(rows[0],{query,at:new Date(clock()).toISOString(),snapshotDate:result.snapshotDate||''});
 }
 async function quote(cart,state){
  if(!cart.lines.length)return zero();const checkedAt=new Date(clock()).toISOString(),issues=[],result=zero();result.checkedAt=checkedAt;result.validUntil=new Date(clock()+900000).toISOString();
  let observations;try{observations=await td.lookup(cart.lines.map(l=>({sku:l.item.sku})));if(!Array.isArray(observations)||observations.length!==cart.lines.length)throw Error('Incomplete data');}catch{return {...result,subtotalCents:null,status:'needs-confirmation',deliveryStatus:cart.zip?'pending':'needs-destination',customerNotice:'Current pricing is temporarily unavailable. Your cart is saved; no order has been placed.',internalIssues:['td-price-lookup-failed'],items:cart.lines.map(l=>({sku:l.item.sku,unitPriceCents:null,lineTotalCents:null,currency:null,availability:'unknown',message:'Price confirmation pending'}))};}
  const source=cart.lines.map((l,i)=>{const current=state.items.find(p=>p.sku===l.item.sku),item=current?structuredClone(current):structuredClone(l.item),o=observations[i];
   const sameIdentity=item.mfgPart.toUpperCase()===l.item.mfgPart.toUpperCase()&&item.manufacturer.toUpperCase()===l.item.manufacturer.toUpperCase();
   const okay=sameIdentity&&matched(item,o)&&fresh(o,clock());if(!okay)issues.push(item.sku+':supplier-identity-or-status');
   const excluded=exclusionReasons(item,state.policy).length>0;if(excluded)issues.push(item.sku+':excluded');
   const stock=okay&&Number.isSafeInteger(o.stockQuantity)?o.stockQuantity:null;
   const availability=excluded?'unavailable':stock===null?'unknown':stock===0?'out-of-stock':stock<l.quantity?'insufficient-stock':'available';
   let price=null;if(okay&&!excluded&&o.currency==='USD'&&Number.isSafeInteger(o.costCents)&&o.costCents>0){
    try{price=indicativeMarkup({...item,distributorCostCents:o.costCents},state.pricingPolicy).indicativePriceCents;}catch{issues.push(item.sku+':price-policy');}
   }else if(okay&&o.currency!=='USD')issues.push(item.sku+':currency-unconfirmed');
   const restriction=item.commerce?.advertisingReview||'unreviewed',map=item.commerce?.mapCents;
   if(item.commerce?.embargoed===true){price=null;issues.push(item.sku+':embargo');}
   // Do not invent an HP minimum advertised price. No customer-view price until reviewed.
   if(/^(?:HP|HEWLETT)/i.test(item.manufacturer)&&restriction==='unreviewed'){price=null;issues.push(item.sku+':manufacturer-price-review');}
   if(restriction==='map'){if(!Number.isSafeInteger(map)||map<=0){price=null;issues.push(item.sku+':map-missing');}else if(price!==null)price=Math.max(price,map);}
   if(!item.review?.resaleConfirmed||!item.review?.contentConfirmed||item.condition!=='new')issues.push(item.sku+':catalog-release-review');
   if(o?.endUserRequired!==false)issues.push(item.sku+':end-user-review');
   if(o?.parcelShippable!==true)issues.push(item.sku+':shipping-review');
   const message=availability==='out-of-stock'?'Currently unavailable':availability==='insufficient-stock'?'Requested quantity is not currently available':availability==='unavailable'?'Not available for purchase':price===null?'Price confirmation pending':availability==='available'?'Available — checked just now':'Availability confirmation pending';
   const total=price===null?null:price*l.quantity;if(total!==null&&(!Number.isSafeInteger(total)||total>100000000000))throw new HttpError(400,'Cart value exceeds the preview limit.');
   result.items.push({sku:item.sku,unitPriceCents:price,lineTotalCents:total,currency:price===null?null:'USD',availability,message});
   return {item:{...item,observation:o,lastCheckFailure:null},observation:o,quantity:l.quantity,okay:okay&&!excluded,stock,restriction,map};
  });
  let freight=null;const deliverable=source.every(l=>l.okay&&l.stock!==null&&l.stock>=l.quantity&&l.observation.parcelShippable===true);
  if(cart.zip&&deliverable){try{freight=await td.freight({zip:cart.zip,items:source.map(l=>({sku:l.item.sku,quantity:l.quantity}))});if(freight.environment!=='production'||!fresh(freight,clock())||freight.zip!==cart.zip)throw Error('Wrong quote');}catch{issues.push('td-freight-quote-pending');freight=null;}}
  result.deliveryStatus=!cart.zip?'needs-destination':!deliverable?'availability-pending':freight?.currency==='USD'&&freight.extraChargesComplete?'estimated':'pending';
  result.deliveryEstimateCents=freight?.currency==='USD'&&freight.extraChargesComplete?freight.amountCents:null;
  if(freight&&!freight.extraChargesComplete)issues.push('delivery-surcharges-unconfirmed');
  // Reuse business defaults once stored by operations. Never ask shoppers for rates, weights or MAP.
  // Until operating defaults are verified, keep the approved 15%/override cost-plus estimate.
  const config=await settings.settings();result.settingsRevision=config.state.revision;const defaults=config.state.cartDefaults;
  if(config.state.policy.settingsConfirmed&&defaults?.confirmed===true&&freight?.currency==='USD'&&freight.extraChargesComplete){
   try{const lines=[];for(const s of source){const {book}=await marketStore.read(s.item);lines.push({item:s.item,assessment:productAssessment(s.item,state,{nowMs:clock()}),book});}
    const scenario={lines:source.map(s=>({id:s.item.id,quantity:s.quantity,unitWeightMilliLb:null,weightConfirmed:false,advertisingReview:s.restriction,mapCents:s.restriction==='map'?s.map:null,mapEvidence:s.item.commerce?.mapEvidence||'',embargoed:s.item.commerce?.embargoed===true})),destinationZip:cart.zip,oneSupplierOrder:freight.shipmentCount===1,accountRuleApplicable:false,quotedFreightCents:freight.amountCents,quoteConfirmed:true,paymentFeeBps:defaults.paymentFeeBps,paymentFixedCents:defaults.paymentFixedCents,adminFeeBps:defaults.adminFeeBps,reserveBps:defaults.reserveBps,handlingCents:defaults.handlingCents,otherCostCents:defaults.otherCostCents,extraPaymentBaseCents:defaults.extraPaymentBaseCents,customerShippingCents:freight.amountCents,costInputsConfirmed:true};
    const analysis=evaluateOrder({lines,scenario,policy:config.state.policy,markupPolicy:state.pricingPolicy,nowMs:clock()});
    if(analysis.recommendedOrderCents!==null){for(const l of analysis.lines){const target=result.items.find(x=>x.sku===l.id.slice(3));if(target&&target.unitPriceCents!==null&&l.recommendedUnitCents!==null){target.unitPriceCents=l.recommendedUnitCents;target.lineTotalCents=l.recommendedUnitCents*l.quantity;}}}
    if(analysis.recommendedOrderCents===null){for(const row of result.items){row.unitPriceCents=null;row.lineTotalCents=null;row.currency=null;row.message='Price confirmation pending';}issues.push('no-profitable-automatic-price');}
    issues.push(...analysis.holds.map(h=>'pricing-hold:'+h));
   }catch{issues.push('automation-defaults-review');}
  }else issues.push('automatic-margin-cost-profile-incomplete');
  result.subtotalCents=result.items.every(x=>x.lineTotalCents!==null)?result.items.reduce((s,x)=>s+x.lineTotalCents,0):null;
  if(result.subtotalCents!==null&&result.subtotalCents>100000000000)throw new HttpError(400,'Cart value exceeds the preview limit.');
  result.estimatedTotalBeforeTaxCents=result.subtotalCents!==null&&result.deliveryEstimateCents!==null?result.subtotalCents+result.deliveryEstimateCents:null;
  result.deliveryEvidence=freight?{source:'tdsynnex-freight',environment:freight.environment,zip:freight.zip,currency:freight.currency,amountCents:freight.amountCents,extraChargesComplete:freight.extraChargesComplete,checkedAt:freight.checkedAt,scope:'destination-zip-estimate'}:null;
  result.internalIssues=issues;result.status=result.items.some(x=>x.availability==='out-of-stock'||x.availability==='insufficient-stock'||x.availability==='unavailable')?'availability-changed':result.subtotalCents===null?'needs-confirmation':'quoted-preview';
  result.customerNotice=result.status==='availability-changed'?'An item is unavailable in the requested quantity. Update your cart to continue.':result.subtotalCents===null?'We are confirming pricing for an item in your cart.':null;
  const evidenceDeadlines=source.filter(s=>s.okay).map(s=>Date.parse(s.observation.checkedAt)+900000);if(freight)evidenceDeadlines.push(Date.parse(freight.checkedAt)+900000);result.validUntil=new Date(Math.min(Date.parse(result.validUntil),...evidenceDeadlines)).toISOString();
  result.supplierObservation=source.map(s=>({sku:s.item.sku,reportedUnitWeight:s.observation.reportedUnitWeight??null,weightUnit:s.observation.weightUnit??null,checkedAt:s.observation.checkedAt}));
  return result;
 }
 async function currentCheckout(owner,record){
  const [{cart},{state:productState},{state:pricingState}]=await Promise.all([cartStore.read(owner),products.read(),settings.settings()]);
  return checkoutView(record,{nowMs:clock(),cartRevision:cart.revision,productRevision:productState.revision,settingsRevision:pricingState.revision});
 }
 return {
  async productOffer(input={}){guard();
   if(!object(input)||Object.keys(input).some(k=>!['sku','quantity','zip'].includes(k)))throw new HttpError(400,'Invalid product-offer fields.');
   const s=sku(input.sku),count=quantity(input.quantity??1),zip=input.zip??'';
   if(typeof zip!=='string'||(zip!==''&&!/^\d{5}$/.test(zip)))throw new HttpError(400,'Enter a valid five-digit delivery ZIP.');
   const {state}=await products.read(),item=await resolve(s,state);if(exclusionReasons(item,state.policy).length)throw new HttpError(404,'This product is not available.');
   const ephemeral={revision:0,zip,lines:[{item,quantity:count}]};ephemeral.quote=await quote(ephemeral,state);
   const latest=await products.read();if(latest.state.revision!==state.revision)throw new HttpError(409,'Product rules changed. Refresh the product price.');
   const visible=customerCart(ephemeral,{nowMs:clock()}),line=visible.items[0];
   return {...line,zip,checkedAt:visible.checkedAt,validUntil:visible.validUntil,deliveryEstimateCents:visible.deliveryEstimateCents,deliveryStatus:visible.deliveryStatus,
    checkoutEnabled:false,preview:true,orderPlaced:false,priceIsPreviewEstimate:true};
  },
  async launchStatus(){guard();const {state}=await products.read();return launchReadiness({env,state,clock});},
  async productDocument(partSku){guard();const {state}=await products.read(),p=await resolve(sku(partSku),state);if(exclusionReasons(p,state.policy).length)throw new HttpError(404,'Product not available.');const cached=content.peek?await content.peek({manufacturer:p.manufacturer,mfgPart:p.mfgPart},'gallery')||await content.peek({manufacturer:p.manufacturer,mfgPart:p.mfgPart},'cover'):null;return {product:card(p),content:cached};},
  async contentCached(partSku,media='cover'){guard();if(!content.peek)return null;const {state}=await products.read(),p=await resolve(sku(partSku),state);if(exclusionReasons(p,state.policy).length)throw new HttpError(404,'Product not available.');const cached=await content.peek({manufacturer:p.manufacturer,mfgPart:p.mfgPart},media);return cached?{...cached,sku:p.sku,manufacturer:p.manufacturer,partNumber:p.mfgPart,cacheStatus:'hit'}:null;},
  async prepareCheckout(owner,input){guard();const clean=validateCheckout(input),fingerprint=checkoutFingerprint(clean),request=await checkoutStore.begin(owner,clean.requestId,fingerprint);
   if(!request.acquired)return {...await currentCheckout(owner,request.record),replayed:true};
   try{
   const {cart}=await cartStore.read(owner);if(cart.revision!==clean.revision)throw new HttpError(409,'Your cart changed. Reload before reviewing checkout.');if(!cart.lines.length)throw new HttpError(400,'Add a product before reviewing checkout.');
   const {state}=await products.read(),temporary=structuredClone(cart);temporary.zip=clean.address.postalCode;temporary.quote=await quote(temporary,state);
   const [{cart:latest},{state:latestState},{state:priceState}]=await Promise.all([cartStore.read(owner),products.read(),settings.settings()]);if(latest.revision!==cart.revision||latestState.revision!==state.revision||(temporary.quote.settingsRevision!==undefined&&priceState.revision!==temporary.quote.settingsRevision))throw new HttpError(409,'Your cart or product rules changed. Review the refreshed cart.');
   const visible=customerCart(temporary,{nowMs:clock()}),holds=['Payment collection is not enabled. No card will be charged.','Sales tax is not calculated yet; it is not assumed to be zero.','Purchase, shipping, cancellation and return policies require approval.','Supplier purchase-order submission and customer order access are not enabled.'];
   if(visible.items.some(x=>x.availability!=='available'))holds.unshift('A product is not confirmed available in the requested quantity.');
   if(visible.subtotalCents===null)holds.unshift('Current product pricing is incomplete.');if(visible.deliveryEstimateCents===null)holds.unshift('Delivery cost needs supplier confirmation.');
   const issues=temporary.quote.internalIssues||[];if(issues.some(x=>/catalog-release-review|excluded|embargo|manufacturer-price-review|map-missing|end-user-review/.test(x)))holds.push('Product resale, content, condition or manufacturer restrictions still need merchant review.');
   if(issues.some(x=>/cost-profile|pricing-hold|automatic.*review|no-profitable/.test(x)))holds.push('Business cost and profit-protection settings still require validation.');
   const createdAt=new Date(clock()).toISOString(),record={schemaVersion:2,phase:'prepared',mode:'preview',owner,id:clean.requestId,requestFingerprint:fingerprint,reference:'TP-REVIEW-'+createdAt.slice(0,10).replaceAll('-','')+'-'+clean.requestId.slice(0,8).toUpperCase(),status:'payment-not-enabled',createdAt,expiresAt:temporary.quote.validUntil,quoteCheckedAt:temporary.quote.checkedAt,quoteValidUntil:temporary.quote.validUntil,cartRevision:cart.revision,productRevision:state.revision,settingsRevision:priceState.revision,contact:clean.contact,address:clean.address,noticeVersion:clean.noticeVersion,consentedAt:createdAt,items:visible.items,subtotalCents:visible.subtotalCents,deliveryEstimateCents:visible.deliveryEstimateCents,estimatedBeforeTaxCents:visible.estimatedTotalBeforeTaxCents,holds};

   const saved=await checkoutStore.complete(record,request.claimToken);return {...await currentCheckout(owner,saved.record),replayed:!saved.created};
   }catch(e){try{await checkoutStore.fail(owner,clean.requestId,request.claimToken);}catch{/* A pending request remains blocked rather than falsely marked saved. */}throw e;}
  },
  // Server-only integration: not accepted through api/shop or any browser-paid switch.
  async finalizationSource(owner,id){guard();
   const record=await checkoutStore.read(owner,id);if(!record||record.owner!==owner||record.phase!=='prepared')throw new HttpError(409,'Prepare a current checkout review first.');
   const [{cart},{state},{state:priceState}]=await Promise.all([cartStore.read(owner),products.read(),settings.settings()]);
   const visible=checkoutView(record,{nowMs:clock(),cartRevision:cart.revision,productRevision:state.revision,settingsRevision:priceState.revision});
   if(visible.needsRecheck)throw new HttpError(409,'The checkout review changed or expired. Recheck the cart.');
   if(!priceState.policy.settingsConfirmed||priceState.cartDefaults?.confirmed!==true)throw new HttpError(409,'Business pricing and cost settings still require review.');
   for(const line of cart.lines){const p=state.items.find(x=>x.sku===line.item.sku);if(!p||p.mfgPart!==line.item.mfgPart||p.manufacturer!==line.item.manufacturer||p.condition!=='new'||!p.categoryConfirmed||!p.review?.resaleConfirmed||!p.review?.contentConfirmed||p.lastCheckFailure||exclusionReasons(p,state.policy).length)throw new HttpError(409,'A product has unresolved release requirements.');}
   const temporary=structuredClone(cart);temporary.zip=record.address.postalCode;temporary.quote=await quote(temporary,state);
   const current=customerCart(temporary,{nowMs:clock()}),q=temporary.quote;
   if(q.internalIssues?.length||current.items.some(x=>x.availability!=='available'||x.currency!=='USD')||current.subtotalCents===null||current.deliveryEstimateCents===null||q.deliveryStatus!=='estimated'||!q.deliveryEvidence)throw new HttpError(409,'Current supplier pricing, availability, shipping or margin protection needs confirmation.');
   const compact=x=>({sku:x.sku,partNumber:x.partNumber,manufacturer:x.manufacturer,quantity:x.quantity,unitPriceCents:x.unitPriceCents,lineTotalCents:x.lineTotalCents});
   if(JSON.stringify(record.items.map(compact))!==JSON.stringify(current.items.map(compact))||record.deliveryEstimateCents!==current.deliveryEstimateCents||record.subtotalCents!==current.subtotalCents)throw new HttpError(409,'Prices or shipping changed. Review the refreshed totals before payment.');
   const snapshot={mode:'test',owner,reviewId:id,reviewFingerprint:record.requestFingerprint,cartRevision:cart.revision,productRevision:state.revision,settingsRevision:priceState.revision,contact:structuredClone(record.contact),address:structuredClone(record.address),lines:current.items.map(x=>({sku:x.sku,manufacturer:x.manufacturer,manufacturerPart:x.partNumber,description:x.title,quantity:x.quantity,unitPriceCents:x.unitPriceCents})),subtotalCents:current.subtotalCents,shippingEstimateCents:current.deliveryEstimateCents,deliveryEvidence:structuredClone(q.deliveryEvidence),quoteCheckedAt:q.checkedAt,quoteExpiresAt:q.validUntil};
   const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};freeze(snapshot);finalizationSources.add(snapshot);
   await this.assertFinalizationSource(owner,snapshot);return snapshot;
  },
  async assertFinalizationSource(owner,source){guard();if(!finalizationSources.has(source)||source.owner!==owner)throw new HttpError(400,'A server-created checkout snapshot is required.');
   const [record,{cart},{state},{state:pricing}]=await Promise.all([checkoutStore.read(owner,source.reviewId),cartStore.read(owner),products.read(),settings.settings()]);
   if(record?.phase!=='prepared'||record.requestFingerprint!==source.reviewFingerprint||cart.revision!==source.cartRevision||state.revision!==source.productRevision||pricing.revision!==source.settingsRevision||Date.parse(source.quoteExpiresAt)<=clock())throw new HttpError(409,'The cart, review or business rules changed during finalization.');
   return true;
  },
  async readCheckout(owner,id){guard();const record=await checkoutStore.read(owner,id);if(!record||record.phase==='discarded')throw new HttpError(404,'Checkout review not found.');if(record.phase==='preparing')throw checkoutFault('checkout_in_progress','This review is still being checked. Retry shortly.');if(record.phase==='failed')throw checkoutFault('checkout_restart_required','This review did not finish. Discard it and start a new review.');return currentCheckout(owner,record);},
  async discardCheckout(owner,id){guard();return checkoutStore.remove(owner,id);},
  contentStatus(){guard();return content.status();},
  async contentLookup(partSku,media="cover"){guard();const s=sku(partSku),{state}=await products.read(),p=await resolve(s,state);if(exclusionReasons(p,state.policy).length)throw new HttpError(404,'Product not available.');const result=await content.lookup({manufacturer:p.manufacturer,mfgPart:p.mfgPart},{media});return {sku:s,partNumber:p.mfgPart,manufacturer:p.manufacturer,...result};},
  async browse(input={}){guard();
   if(!object(input)||Object.keys(input).some(k=>!['q','category','maker','page','cursor'].includes(k)))throw new HttpError(400,'Invalid search.');
   const query=inventoryQuery({q:input.q,maker:input.maker,category:input.category,cursor:input.cursor}),{state}=await products.read();
   let data,legacy=false;
   try{data=await inventoryBrowse(query);}catch(e){
    if(e.code!=='catalog_browse_upgrade_required')throw e;
    if(query.cursor)throw new HttpError(409,'The catalog connector changed. Start again from the first page.');
    if(!query.q&&!query.maker)return {items:[],hasMore:false,nextCursor:null,page:0,preview:true,catalog:{scope:'full-supplier-index',mode:'connector-update-required',totalRecords:null,indexModifiedAt:null},notice:'Full browsing needs the one-time catalog connector update. Search by a product name or part number in the meantime.'};
    legacy=true;const q=catalogQuery(new URLSearchParams({...query,exact:'0',page:String(input.page||0)}));data=await catalog(q);
   }
   const items=[];let filtered=0;for(const raw of data.items){try{const candidate=candidateFromSnapshot(raw,{query:{...query,exact:false,page:0},at:new Date(clock()).toISOString(),snapshotDate:''});const existing=state.items.find(p=>p.sku===candidate.sku);const item=existing||candidate;if(exclusionReasons(item,state.policy).length){filtered++;continue;}if(!items.some(x=>x.sku===item.sku))items.push(item);}catch{filtered++;}}
   return {items:items.map(card),hasMore:data.hasMore,nextCursor:legacy?null:data.nextCursor,page:legacy?Number(input.page||0):undefined,preview:true,
    catalog:{scope:'full-supplier-index',mode:legacy?'keyword-search':'full-browse',totalRecords:Number.isSafeInteger(data.totalRecords)?data.totalRecords:null,indexModifiedAt:data.indexModifiedAt||null},filteredOnPage:filtered,
    notice:items.length?'':data.hasMore?'This page contains items excluded by your product rules. Continue to the next page.':'No matching products found.'};
  },
  async read(id){guard();const {cart}=await cartStore.read(id);return customerCart(cart,{nowMs:clock()});},
  async change(id,request){guard();if(!object(request)||!['add','quantity','remove','destination','refresh','clear'].includes(request.action))throw new HttpError(400,'Unsupported cart action.');
   const allowed={add:['sku','quantity','zip'],quantity:['sku','quantity'],remove:['sku'],destination:['zip'],refresh:[],clear:[]};if(Object.keys(request).some(k=>!['action','revision',...allowed[request.action]].includes(k)))throw new HttpError(400,'Unsupported cart fields.');
   if(request.action==='add'&&request.zip!==undefined&&(typeof request.zip!=='string'||!/^\d{5}$/.test(request.zip)))throw new HttpError(400,'Enter a five-digit delivery ZIP.');
   if(!Number.isSafeInteger(request.revision)||request.revision<0)throw new HttpError(400,'Invalid cart revision.');
   const {cart,etag}=await cartStore.read(id);if(cart.revision!==request.revision)throw new HttpError(409,'Cart changed in another tab. Reload before continuing.');const {state}=await products.read();
   if(request.action==='add'){const s=sku(request.sku),q=quantity(request.quantity),index=cart.lines.findIndex(l=>l.item.sku===s);if(index>=0)cart.lines[index].quantity=quantity(cart.lines[index].quantity+q);else{if(cart.lines.length>=20)throw new HttpError(400,'The cart supports up to 20 products.');const item=await resolve(s,state);if(exclusionReasons(item,state.policy).length)throw new HttpError(409,'This product is not available in the storefront.');cart.lines.push({item,quantity:q});}}
   if(request.action==='quantity'){const s=sku(request.sku),q=quantity(request.quantity),line=cart.lines.find(l=>l.item.sku===s);if(!line)throw new HttpError(404,'Cart item not found.');line.quantity=q;}
   if(request.action==='remove')cart.lines=cart.lines.filter(l=>l.item.sku!==sku(request.sku));
   if(request.action==='destination'){if(!/^\d{5}$/.test(request.zip||''))throw new HttpError(400,'Enter a five-digit delivery ZIP.');cart.zip=request.zip;}
   if(request.action==='clear')cart.lines=[];
   if(request.action==='add'&&request.zip!==undefined)cart.zip=request.zip;
   cart.quote=await quote(cart,state);cart.revision++;cart.updatedAt=new Date(clock()).toISOString();
   const latest=await products.read();if(latest.state.revision!==state.revision)throw new HttpError(409,'Product rules changed while pricing the cart. Please reload before continuing.');
   await cartStore.save(cart,etag);return customerCart(cart,{nowMs:clock()});
  },
  async diagnostics(id){guard();const [{cart},{state}]=await Promise.all([cartStore.read(id),settings.settings()]);return {issues:cart.quote?.internalIssues||[],supplierWeightMetadata:cart.quote?.supplierObservation||[],cartDefaultsConfigured:state.cartDefaults?.confirmed===true,td:td.configuration(),checkoutEnabled:false};}
 };
}
