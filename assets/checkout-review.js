// Private review UI: preserve the same request on uncertain replies and never paint a
// delayed result into a new review. No contact details or payment data enter localStorage.
export function setupCheckoutReview({api,getCart,refreshCart}){
 const $=id=>document.getElementById(id),el=(t,s)=>{const n=document.createElement(t);n.textContent=s;return n;},money=c=>Number.isSafeInteger(c)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100):'Pending';
 const dialog=$('checkout-review'),form=$('checkout-review-form');let phase='editing',request=null,result=null,operation=0,expiryTimer=null;
 const busy=()=>phase==='saving'||phase==='discarding';
 function message(s){$('checkout-review-status').textContent=s;}
 function controls(){
  const locked=['saving','uncertain','failed','discarding','saved'].includes(phase);
  for(const input of form.querySelectorAll('input'))input.disabled=locked;
  $('checkout-review-submit').disabled=busy()||phase==='saved'||phase==='failed';
  $('checkout-review-submit').textContent=phase==='uncertain'?'Retry the same review':'Recheck cart & save review';
  $('review-checkout-button').disabled=busy()||(!getCart().items.length&&!request);
  $('checkout-review-cancel').hidden=!request||phase==='saved';$('checkout-review-cancel').disabled=phase==='discarding';
  $('checkout-review-discard').disabled=phase==='discarding';
  $('checkout-review-restart').hidden=!(phase==='failed'||result?.needsRecheck);$('checkout-review-restart').disabled=busy();
 }
 function showResult(){
  if(!result)return;clearTimeout(expiryTimer);
  const expires=Date.parse(result.expiresAt),localExpired=!Number.isFinite(expires)||expires<=Date.now(),changed=result.cartRevision!==getCart().revision;
  if(localExpired||changed)result={...result,needsRecheck:true,status:localExpired?'expired-review':'recheck-required',holds:[...new Set([localExpired?'This review expired. Recheck the cart before continuing.':'The cart changed after this review. Recheck before continuing.',...result.holds])]};
  const stale=result.needsRecheck===true;
  $('checkout-review-result').hidden=false;form.hidden=true;
  $('checkout-review-result-title').textContent=stale?'Review needs updating':'Checkout review saved';
  $('checkout-review-reference').textContent=result.reference+' · '+new Date(result.createdAt).toLocaleString();
  $('checkout-review-totals').replaceChildren(...[['Products',stale?'Recheck required':money(result.subtotalCents)],['Delivery estimate',stale?'Recheck required':money(result.deliveryEstimateCents)],['Sales tax','Not calculated — pending setup'],['Final payable total','Not available; nothing charged']].map(([k,v])=>{const d=el('div','');d.append(el('dt',k),el('dd',v));return d;}));
  $('checkout-review-holds').replaceChildren(...[...new Set(result.holds||[])].map(h=>el('p',h)));
  if(!stale&&expires>Date.now())expiryTimer=setTimeout(()=>{if(phase==='saved'){showResult();message('This review expired. No payment or order was submitted.');}},Math.min(expires-Date.now()+1,900001));
  controls();
 }
 function reset({keepFields=false}={}){operation++;clearTimeout(expiryTimer);request=null;result=null;phase='editing';if(!keepFields)form.reset();form.elements.consent.checked=false;form.elements.postalCode.value=getCart().zip||form.elements.postalCode.value||'';$('checkout-review-result').hidden=true;form.hidden=false;controls();}
 async function discard({restart=false}={}){
  if(!request||phase==='discarding')return;const id=request.requestId,previous=phase,run=++operation;phase='discarding';controls();message('Discarding this private review…');
  try{const response=await api(null,{action:'discard-checkout',id});if(run!==operation)return;if(response.discarded!==true)throw Error('Discard was not confirmed. Retry before starting another review.');reset({keepFields:restart});if(restart){try{await refreshCart();form.elements.postalCode.value=getCart().zip||form.elements.postalCode.value;message('Cart refreshed. Review the details and consent before saving a new review.');}catch(error){message('The previous review was discarded, but the cart could not be refreshed. '+(error.message||'Try loading the cart again.'));}}else message('The private checkout review was discarded. Your cart is unchanged.');}
  catch(error){if(run!==operation)return;phase=previous==='saving'?'uncertain':previous;message(error.message||'Discard is unconfirmed. Please retry.');controls();}
 }
 $('review-checkout-button').addEventListener('click',()=>{
  if(busy())return;
  if(!request){reset({keepFields:true});message('');}else if(result){showResult();message(result.needsRecheck?'This saved review must be updated. No payment has been taken.':'Previously saved private review. No payment or order was submitted.');}
  dialog.showModal();
 });
 $('checkout-review-close').addEventListener('click',()=>dialog.close());
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy()||phase==='saved'||phase==='failed')return;
  if(!request){const f=new FormData(form);request={action:'prepare-checkout',requestId:crypto.randomUUID(),revision:getCart().revision,contact:{name:f.get('name'),email:f.get('email'),organization:f.get('organization'),phone:f.get('phone')},address:{line1:f.get('line1'),line2:f.get('line2'),city:f.get('city'),state:f.get('state'),postalCode:f.get('postalCode'),country:'US'},noticeVersion:f.get('noticeVersion'),consent:f.has('consent')};}
  const payload=structuredClone(request),run=++operation;phase='saving';controls();message('Rechecking current prices, requested stock and delivery cost…');
  try{const saved=await api(null,payload);if(run!==operation)return;if(saved.id!==payload.requestId||saved.preview!==true||saved.canPay!==false)throw Error('The checkout response could not be verified. Retry the same review.');result=saved;phase='saved';showResult();message(saved.needsRecheck?'The saved review needs a fresh cart check. No order or payment was submitted.':'Private review saved. No payment, supplier order or email was sent.');}
  catch(error){if(run!==operation)return;
   if(error.status===400){request=null;phase='editing';message(error.message);}
   else if(error.code==='checkout_discarded'){reset();message('This request was discarded. Start a new review.');}
   else if(error.status===409&&error.code!=='checkout_in_progress'){phase='failed';message(error.message||'The cart changed. Update it before a new review.');}
   else {phase='uncertain';message((error.message||'The reply was interrupted.')+' Retry the same review to recover its result; do not create another submission.');}
  }finally{if(run===operation)controls();}
 });
 $('checkout-review-cancel').addEventListener('click',()=>discard());$('checkout-review-discard').addEventListener('click',()=>discard());$('checkout-review-restart').addEventListener('click',()=>discard({restart:true}));
 return {update:()=>{if(result&&phase==='saved')showResult();controls();}};
}
