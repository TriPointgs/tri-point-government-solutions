const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const money=n=>n===null||n===undefined?'Pending':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
let cart={revision:0,items:[],itemCount:0},page=0,query={q:'',category:'all'},hasMore=false,nextCursor=null,cursors=[''],browseMode=null,busy=false,searchBusy=false,requestNo=0;
// Preview: only enrich specifically searched/filtered visible products, never 50+ arbitrary
// first-page catalog records or all 1.2M supplier items. No automatic provider polling.
const icecatCache=new Map(),artIdentity=new WeakMap();
// Per-search pilot budget; the old lifetime tab cap could silently disable images after browsing four products.
const MAX_AUTO_PER_SEARCH=2;
let mediaObserver=null,searchGeneration=0;
function exactMedia(data,p){
 return !!(data?.status==='matched'&&data?.identityVerified===true&&data?.product&&
 data.product.brand?.trim().toUpperCase()===p.manufacturer.trim().toUpperCase()&&
 data.product.partNumber?.trim().toUpperCase()===p.partNumber.trim().toUpperCase());
}
function getIcecat(p,media="cover"){
 const cacheKey=[p.sku,p.manufacturer.trim().toUpperCase(),p.partNumber.trim().toUpperCase(),media].join(':');
 let pending=icecatCache.get(cacheKey);
 if(pending)return pending;
 pending=api({view:'content',sku:p.sku,media}).then(d=>{
  if(!exactMedia(d,p))return {status:d.status||'not-found',message:d.message||'No exact product photo returned.',product:null,imageData:null};
  return d;
 }).catch(e=>{icecatCache.delete(cacheKey);throw e;});
 // Small per-tab cache; no secret URL or raw supplier cost is stored in this browser.
 if(icecatCache.size>=24)icecatCache.delete(icecatCache.keys().next().value);
 icecatCache.set(cacheKey,pending);return pending;
}
function showCardPhoto(art,p,d){
 if(!art?.isConnected||artIdentity.get(art)!==p.sku)return;
 if(exactMedia(d,p)&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d.imageData||'')){
  const img=el('img');img.src=d.imageData;img.alt='';img.loading='lazy';art.replaceChildren(img);art.dataset.photo='loaded';
 }else{art.replaceChildren(el('span','Image unavailable','image-unavailable'));art.dataset.photo='unavailable';}
}
function autoMedia(p,art){
 art.dataset.photo='loading';art.replaceChildren(el('span','Loading photo…','image-loading'));
 getIcecat(p).then(d=>showCardPhoto(art,p,d)).catch(e=>{
  if(!art.isConnected||artIdentity.get(art)!==p.sku)return;
  const limited=e?.status===429;
  art.replaceChildren(el('span',limited?'Photo lookup paused':'Image unavailable','image-unavailable'));
  art.dataset.photo=limited?'paused':'unavailable';
 });
}
function scheduleVisibleImages(cards,explicitQuery){
 if(mediaObserver)mediaObserver.disconnect();
 if(!explicitQuery||!cards.length)return;
 const generation=++searchGeneration;
 let perSearch=0;
 const searchPart=String(query.q||'').trim().toUpperCase();
 // Exact manufacturer-part / TD SKU searches should not depend on IntersectionObserver
 // firing or on a budget already consumed by earlier, unrelated browsing.
 const exact=searchPart?cards.filter(c=>String(c.p.partNumber||'').toUpperCase()===searchPart||String(c.p.sku||'')===searchPart):[];
 const priority=exact.length?exact.slice(0,MAX_AUTO_PER_SEARCH):(cards.length===1&&searchPart?[cards[0]]:[]);
 for(const card of priority){
  perSearch++;
  autoMedia(card.p,card.art);
 }
 // When the exact part was found, don't spend a second provider request on prefix matches.
 if(exact.length||perSearch>=MAX_AUTO_PER_SEARCH||typeof IntersectionObserver!=='function')return;
 mediaObserver=new IntersectionObserver(entries=>{
  if(generation!==searchGeneration)return;
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   mediaObserver.unobserve(entry.target);
   if(perSearch>=MAX_AUTO_PER_SEARCH)continue;
   const original=artIdentity.get(entry.target);
   const card=cards.find(c=>c.p.sku===original&&c.art===entry.target);
   if(!card||!entry.target.isConnected)continue;
   perSearch++;
   autoMedia(card.p,card.art);
  }
 },{rootMargin:'80px'});
 for(const card of cards)if(!priority.includes(card))mediaObserver.observe(card.art);
}

function status(message,error=false){$('shop-status').textContent=message;$('shop-status').classList.toggle('error',error);}
async function api(params,body){const response=await fetch('/api/shop?'+new URLSearchParams(params||{}),{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{throw Error('The shop did not respond. Your order has not been placed.');}if(response.status===401){$('product-grid').replaceChildren();$('cart-items').replaceChildren();location.assign('/login?next=%2Fshop-preview');throw Error('Sign in to view the private shopping preview.');}if(!response.ok){const e=Error(data.error||'The cart could not be updated.');e.status=response.status;throw e;}return data;}
function controls(){for(const b of document.querySelectorAll('.add-button,.cart-remove,#delivery-form button,#cart-clear'))b.disabled=busy;for(const n of document.querySelectorAll('.cart-quantity'))n.disabled=busy;$('products-back').disabled=searchBusy||page===0;$('products-next').disabled=searchBusy||!hasMore;$('cart-state').textContent=busy?'Updating…':cart.itemCount?cart.itemCount+' item'+(cart.itemCount===1?'':'s'):'Empty';$('shopping-cart').setAttribute('aria-busy',String(busy));}
function productCard(p){const a=el('article',undefined,'product-card');const art=el('div',undefined,'product-visual');artIdentity.set(art,p.sku);a.dataset.sku=p.sku;art.innerHTML='<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="28" y="15" width="104" height="62" rx="6"></rect><path d="M18 80h124l-8 8H26z"></path><path class="screen-mark" d="M68 46h24M80 34v24"></path></svg>';a.append(art,el('p',p.manufacturer,'product-maker'),el('h3',p.title),el('p',p.partNumber,'product-part'),el('p','Live price checked in cart','live-price'));const row=el('div',undefined,'card-action'),label=el('label','Qty'),input=el('input');input.type='number';input.min='1';input.max='9999';input.step='1';input.value='1';input.setAttribute('aria-label','Quantity for '+p.partNumber);label.append(input);const add=el('button','Add to cart','add-button');add.type='button';add.addEventListener('click',()=>{const quantity=Number(input.value);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>9999){status('Enter a whole quantity from 1 to 9999.',true);return;}change({action:'add',sku:p.sku,quantity});});const details=el('button','Photos & specs','details-button');details.type='button';details.addEventListener('click',()=>showDetails(p,art));row.append(label,add,details);a.append(row);return a;}
let galleryPhotos=[],galleryIndex=0,detailsSequence=0;
function setGalleryIndex(index){
 if(!galleryPhotos.length)return;
 galleryIndex=(index+galleryPhotos.length)%galleryPhotos.length;
 const stage=$('details-image'),photo=el('img');
 photo.src=galleryPhotos[galleryIndex];photo.alt='Product photo '+(galleryIndex+1)+' of '+galleryPhotos.length;
 photo.decoding='async';stage.replaceChildren(photo);stage.setAttribute('aria-label',photo.alt);
 $('details-count').textContent=(galleryIndex+1)+' of '+galleryPhotos.length+' photos';
 const multiple=galleryPhotos.length>1;
 $('details-prev').disabled=!multiple;$('details-next').disabled=!multiple;
 for(const [i,button]of [...$('details-thumbs').children].entries()){
  const current=i===galleryIndex;button.setAttribute('aria-pressed',String(current));button.classList.toggle('is-current',current);
 }
}
function setGalleryImages(images){
 galleryPhotos=images.filter(x=>/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x||'')).slice(0,5);
 $('details-thumbs').replaceChildren();
 if(!galleryPhotos.length){
  $('details-image').replaceChildren(el('p','Image unavailable'));
  $('details-count').textContent='No approved photo returned';
  $('details-prev').disabled=true;$('details-next').disabled=true;return;
 }
 for(const [i,src]of galleryPhotos.entries()){
  const button=el('button',undefined,'details-thumb');button.type='button';button.setAttribute('aria-label','View product photo '+(i+1));
  const img=el('img');img.src=src;img.alt='';img.loading='lazy';button.append(img);button.addEventListener('click',()=>setGalleryIndex(i));$('details-thumbs').append(button);
 }
 setGalleryIndex(0);
}
$('details-prev').addEventListener('click',()=>setGalleryIndex(galleryIndex-1));
$('details-next').addEventListener('click',()=>setGalleryIndex(galleryIndex+1));
async function showDetails(p,art){
 const run=++detailsSequence,dialog=$('product-details');
 $('details-title').textContent=p.title;$('details-brand').textContent=p.manufacturer;$('details-full-name-wrap').hidden=true;$('details-full-name-wrap').open=false;$('details-full-name').textContent='';
 $('details-part').textContent='Manufacturer part: '+p.partNumber;
 $('details-short').textContent='';$('details-description').textContent='';$('details-specs').replaceChildren();
 $('details-spec-count').textContent='';$('details-description-wrap').hidden=true;
 $('details-description-wrap').open=false;$('details-specification-wrap').open=true;
 $('details-image').replaceChildren(el('p','Loading product photographs…'));
 $('details-count').textContent='Checking image gallery…';$('details-thumbs').replaceChildren();
 $('details-prev').disabled=true;$('details-next').disabled=true;galleryPhotos=[];
 $('details-status').textContent='Checking exact Icecat product content…';dialog.showModal();
 try{
  const d=await getIcecat(p,'gallery');
  if(!dialog.open||run!==detailsSequence)return;
  $('details-status').textContent=d.message||'Product-content lookup completed.';
  if(!exactMedia(d,p)){$('details-image').replaceChildren(el('p','Image unavailable'));$('details-count').textContent='No matching photos';return;}
  // Use the concise TD catalog name as the heading. The complete Icecat marketing title
  // remains available but no longer dominates the top half of the product dialog.
  $('details-title').textContent=p.title;
  const fullTitle=String(d.product.title||'').trim(),shortTitle=String(p.title||'').trim();
  const different=fullTitle.length>0&&fullTitle.toLocaleUpperCase()!==shortTitle.toLocaleUpperCase();
  $('details-full-name-wrap').hidden=!different;
  $('details-full-name').textContent=different?fullTitle:'';

  $('details-part').textContent=d.product.brand+' · '+d.product.partNumber+' · Exact part verified';
  const description=d.product.description||'No detailed description provided.';
  // Long paragraphs no longer consume the whole scrollable modal on arrival.
  $('details-short').textContent=description.length>220?description.slice(0,220).trimEnd()+'…':description;
  $('details-description-wrap').hidden=description.length<=220;
  $('details-description').textContent=description;
  let n=0;
  for(const entry of d.product.specs||[]){
   const name=String(entry.name||'').trim(),value=String(entry.value||'').trim();
   if(!name||!value)continue;
   const dt=el('dt',name),dd=el('dd',value);$('details-specs').append(dt,dd);n++;
  }
  $('details-spec-count').textContent=n?'('+n+')':'';
  if(!n)$('details-specs').append(el('p','No technical attributes returned for this exact part.'));
  const images=Array.isArray(d.images)&&d.images.length?d.images:[d.imageData].filter(Boolean);
  setGalleryImages(images);
  if(images.length)showCardPhoto(art,p,d);
 }catch(e){
  if(run!==detailsSequence||!dialog.open)return;
  $('details-status').textContent=e.message||'Product details are temporarily unavailable.';
  setGalleryImages([]);
 }
}
$('details-close').addEventListener('click',()=>{$('product-details').close();detailsSequence++;});
async function search(){const sequence=++requestNo;searchGeneration++;if(mediaObserver)mediaObserver.disconnect();searchBusy=true;controls();status('Finding products…');try{const result=await api({view:'products',...query,page,...(cursors[page]?{cursor:cursors[page]}:{})});if(sequence!==requestNo)return;hasMore=result.hasMore;nextCursor=result.nextCursor||null;browseMode=result.catalog?.mode||null;const cards=result.items.map(p=>({p,node:productCard(p)}));$('product-grid').replaceChildren(...cards.map(c=>c.node));scheduleVisibleImages(cards.map(c=>({p:c.p,art:c.node.querySelector('.product-visual')})),!!query.q||query.category!=='all');$('product-count').textContent=result.items.length+' shown'+(Number.isSafeInteger(result.catalog?.totalRecords)?' · '+result.catalog.totalRecords.toLocaleString()+' source records':'');$('catalog-scope').textContent=result.catalog?.mode==='connector-update-required'?'Keyword search covers the supplier index. Full browsing awaits the connector update.':'Browsing the full imported supplier catalog—not just your saved selection. Prices and stock are checked in cart.';if(!result.items.length)$('product-grid').append(el('p',result.notice||'No matching products. Try another search.','empty-state'));status(result.items.length?'Choose a quantity and add a product to your cart.':result.notice||'No products found. Try another search.');}catch(e){status(e.message,true);}finally{if(sequence===requestNo){searchBusy=false;controls();}}}
function renderCart(){
 $('cart-count').textContent=cart.itemCount;$('delivery-form').elements.zip.value=cart.zip||'';
 $('cart-items').replaceChildren(...cart.items.map(p=>{const d=el('article',undefined,'cart-item');d.append(el('strong',p.title),el('p',p.partNumber,'cart-part'));const row=el('div',undefined,'cart-item-actions'),label=el('label','Qty'),input=el('input');input.type='number';input.min='1';input.max='9999';input.value=p.quantity;input.className='cart-quantity';input.setAttribute('aria-label','Cart quantity for '+p.partNumber);input.addEventListener('change',()=>{const q=Number(input.value);if(!Number.isSafeInteger(q)||q<1||q>9999){input.value=p.quantity;status('Enter a whole quantity from 1 to 9999.',true);return;}change({action:'quantity',sku:p.sku,quantity:q});});label.append(input);const remove=el('button','Remove','cart-remove');remove.type='button';remove.addEventListener('click',()=>change({action:'remove',sku:p.sku}));row.append(label,el('strong',money(p.lineTotalCents)),remove);d.append(row,el('p',p.message,'availability '+(p.availability==='available'?'available':'pending')));return d;}));
 if(!cart.items.length)$('cart-items').append(el('p','Your cart is empty. Add a product to see current pricing and availability.','empty-cart'));
 $('cart-subtotal').textContent=cart.items.length?money(cart.subtotalCents):'—';$('cart-shipping').textContent=!cart.zip?'Enter ZIP':cart.deliveryStatus==='estimated'?money(cart.deliveryEstimateCents):cart.items.length?'Confirming…':'—';$('cart-total').textContent=cart.items.length?money(cart.estimatedTotalBeforeTaxCents):'—';$('cart-notice').textContent=cart.notice||'';$('cart-checked').textContent=cart.checkedAt?'Prices checked '+new Date(cart.checkedAt).toLocaleTimeString()+'. Inventory is not reserved.':'';controls();
}
async function change(input){if(busy)return;busy=true;controls();status('Checking current pricing and availability…');try{cart=await api(null,{...input,revision:cart.revision});renderCart();status(input.action==='add'?'Added to your cart. Pricing and availability checked automatically.':input.action==='remove'?'Removed from cart. Totals updated.':'Cart updated automatically.');}catch(e){status(e.message,true);if(e.status===409){try{cart=await api({view:'cart'});renderCart();}catch{}}}finally{busy=false;controls();}}
$('shop-search').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);query={q:String(f.get('q')||'').trim(),category:f.get('category')||'all'};page=0;cursors=[''];nextCursor=null;search();});
$('products-back').addEventListener('click',()=>{if(page>0){page--;search();}});$('products-next').addEventListener('click',()=>{if(hasMore){if(browseMode==='full-browse'){if(!nextCursor)return;cursors[page+1]=nextCursor;}page++;search();}});
$('delivery-form').addEventListener('submit',e=>{e.preventDefault();const zip=e.target.elements.zip.value.trim();if(!/^\d{5}$/.test(zip)){status('Enter your five-digit delivery ZIP.',true);return;}change({action:'destination',zip});});
$('show-cart').addEventListener('click',()=>$('shopping-cart').scrollIntoView({behavior:'smooth',block:'start'}));$('cart-clear').addEventListener('click',()=>change({action:'clear'}));
async function start(){try{cart=await api({view:'cart'});renderCart();await search();if(cart.items.length)await change({action:'refresh'});}catch(e){status(e.message,true);}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&cart.items.length&&Date.parse(cart.validUntil||'')<Date.now()&&!busy)change({action:'refresh'});});
start();
