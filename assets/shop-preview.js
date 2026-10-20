const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const money=n=>n===null||n===undefined?'Pending':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
let cart={revision:0,items:[],itemCount:0},page=0,query={q:'',category:'all'},hasMore=false,nextCursor=null,cursors=[''],browseMode=null,busy=false,searchBusy=false,requestNo=0;
// Preview: only enrich specifically searched/filtered visible products, never 50+ arbitrary
// first-page catalog records or all 1.2M supplier items. No automatic provider polling.
const icecatCache=new Map(),artIdentity=new WeakMap();
const MAX_AUTO_PER_SEARCH=2,MAX_AUTO_PER_TAB=4;
let autoUsed=0,mediaObserver=null,searchGeneration=0;
function exactMedia(data,p){
 return !!(data?.status==='matched'&&data?.identityVerified===true&&data?.product&&
 data.product.brand?.trim().toUpperCase()===p.manufacturer.trim().toUpperCase()&&
 data.product.partNumber?.trim().toUpperCase()===p.partNumber.trim().toUpperCase());
}
function getIcecat(p){
 let pending=icecatCache.get(p.sku);
 if(pending)return pending;
 pending=api({view:'content',sku:p.sku}).then(d=>{
  if(!exactMedia(d,p))return {status:d.status||'not-found',message:d.message||'No exact product photo returned.',product:null,imageData:null};
  return d;
 }).catch(e=>{icecatCache.delete(p.sku);throw e;});
 // Small per-tab cache; no secret URL or raw supplier cost is stored in this browser.
 if(icecatCache.size>=24)icecatCache.delete(icecatCache.keys().next().value);
 icecatCache.set(p.sku,pending);return pending;
}
function showCardPhoto(art,p,d){
 if(!art?.isConnected||artIdentity.get(art)!==p.sku)return;
 if(exactMedia(d,p)&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d.imageData||'')){
  const img=el('img');img.src=d.imageData;img.alt='';img.loading='lazy';art.replaceChildren(img);art.dataset.photo='loaded';
 }else{art.replaceChildren(el('span','Image unavailable','image-unavailable'));art.dataset.photo='unavailable';}
}
function autoMedia(p,art){
 art.dataset.photo='loading';art.replaceChildren(el('span','Loading photo…','image-loading'));
 getIcecat(p).then(d=>showCardPhoto(art,p,d)).catch(()=>{
  if(!art.isConnected||artIdentity.get(art)!==p.sku)return;
  art.replaceChildren(el('span','Image unavailable','image-unavailable'));art.dataset.photo='unavailable';
 });
}
function scheduleVisibleImages(cards,explicitQuery){
 if(mediaObserver)mediaObserver.disconnect();
 if(!explicitQuery||autoUsed>=MAX_AUTO_PER_TAB||!cards.length)return;
 const generation=++searchGeneration;
 let perSearch=0;
 if(typeof IntersectionObserver!=='function')return; // details button remains available
 mediaObserver=new IntersectionObserver(entries=>{
  if(generation!==searchGeneration)return;
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   mediaObserver.unobserve(entry.target);
   if(autoUsed>=MAX_AUTO_PER_TAB||perSearch>=MAX_AUTO_PER_SEARCH)continue;
   const original=artIdentity.get(entry.target),card=cards.find(c=>c.p.sku===original&&c.art===entry.target);
   if(!card||!entry.target.isConnected)continue;
   autoUsed++;perSearch++;
   autoMedia(card.p,card.art);
  }
 },{rootMargin:'80px'});
 for(const c of cards)mediaObserver.observe(c.art);
}

function status(message,error=false){$('shop-status').textContent=message;$('shop-status').classList.toggle('error',error);}
async function api(params,body){const response=await fetch('/api/shop?'+new URLSearchParams(params||{}),{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{throw Error('The shop did not respond. Your order has not been placed.');}if(response.status===401){$('product-grid').replaceChildren();$('cart-items').replaceChildren();location.assign('/login?next=%2Fshop-preview');throw Error('Sign in to view the private shopping preview.');}if(!response.ok){const e=Error(data.error||'The cart could not be updated.');e.status=response.status;throw e;}return data;}
function controls(){for(const b of document.querySelectorAll('.add-button,.cart-remove,#delivery-form button,#cart-clear'))b.disabled=busy;for(const n of document.querySelectorAll('.cart-quantity'))n.disabled=busy;$('products-back').disabled=searchBusy||page===0;$('products-next').disabled=searchBusy||!hasMore;$('cart-state').textContent=busy?'Updating…':cart.itemCount?cart.itemCount+' item'+(cart.itemCount===1?'':'s'):'Empty';$('shopping-cart').setAttribute('aria-busy',String(busy));}
function productCard(p){const a=el('article',undefined,'product-card');const art=el('div',undefined,'product-visual');artIdentity.set(art,p.sku);a.dataset.sku=p.sku;art.innerHTML='<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="28" y="15" width="104" height="62" rx="6"></rect><path d="M18 80h124l-8 8H26z"></path><path class="screen-mark" d="M68 46h24M80 34v24"></path></svg>';a.append(art,el('p',p.manufacturer,'product-maker'),el('h3',p.title),el('p',p.partNumber,'product-part'),el('p','Live price checked in cart','live-price'));const row=el('div',undefined,'card-action'),label=el('label','Qty'),input=el('input');input.type='number';input.min='1';input.max='9999';input.step='1';input.value='1';input.setAttribute('aria-label','Quantity for '+p.partNumber);label.append(input);const add=el('button','Add to cart','add-button');add.type='button';add.addEventListener('click',()=>{const quantity=Number(input.value);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>9999){status('Enter a whole quantity from 1 to 9999.',true);return;}change({action:'add',sku:p.sku,quantity});});const details=el('button','Photos & specs','details-button');details.type='button';details.addEventListener('click',()=>showDetails(p,art));row.append(label,add,details);a.append(row);return a;}
async function showDetails(p,art){
 const dialog=$('product-details');$('details-title').textContent=p.manufacturer+' product details';
 $('details-name').textContent=p.title;$('details-part').textContent='Manufacturer part: '+p.partNumber;
 $('details-description').textContent='';$('details-specs').replaceChildren();$('details-image').replaceChildren(el('p','Checking exact Icecat product content…'));
 $('details-status').textContent='Retrieving permitted product images and specifications…';dialog.showModal();
 try{const d=await getIcecat(p);
 if(!dialog.open)return;
 $('details-status').textContent=d.message||'Icecat lookup completed.';
 if(d.status!=='matched'||!d.product){$('details-image').replaceChildren(el('p','Image unavailable'));return;}
 $('details-name').textContent=d.product.title||p.title;
 $('details-description').textContent=d.product.description||'No full description returned.';
 $('details-part').textContent=d.product.brand+' · '+d.product.partNumber+' · Icecat match verified';
 for(const entry of d.product.specs||[]){const dt=el('dt',entry.name),dd=el('dd',entry.value);$('details-specs').append(dt,dd);}
 $('details-image').replaceChildren();
 if(d.imageData?.startsWith('data:image/')){const img=el('img');img.src=d.imageData;img.alt='Product image for '+d.product.brand+' '+d.product.partNumber;img.loading='lazy';$('details-image').append(img);
  // A successful exact product image also replaces the generic card artwork in this private session.
  showCardPhoto(art,p,d);
 }else $('details-image').append(el('p','Image unavailable'));
 }catch(e){$('details-status').textContent=e.message||'Product details are temporarily unavailable.';$('details-image').replaceChildren(el('p','Image unavailable'));}
}
$('details-close').addEventListener('click',()=>$('product-details').close());
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
