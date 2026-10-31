const $=id=>document.getElementById(id),form=$('setup-form');
let saved=null,pending=null,phase='loading',available=false,dirty=false;
const busy=()=>['loading','saving'].includes(phase);
const notice=text=>{$('setup-status').textContent=text;};
function controls(){
 $('setup-fields').disabled=!available||busy()||!!pending;
 $('setup-save').disabled=!available||busy()||phase==='conflict'||(!dirty&&!pending);
 $('setup-save').textContent=phase==='uncertain'?'Retry same draft save':'Save private draft';
 $('setup-reload').disabled=busy();
 $('setup-export').hidden=!saved?.revision||dirty||!!pending||busy();
 $('setup-add').disabled=$('setup-products').children.length>=100;
}
function changed(){dirty=true;notice('Unsaved changes. Approved checkout settings are unchanged.');controls();}
function row(product={sku:'',manufacturerPart:'',taxCode:''}){
 const tr=document.createElement('tr');
 for(const [key,label,max,pattern] of [['sku','TD SKU',12,'[1-9][0-9]{0,11}'],['manufacturerPart','Manufacturer part',120,null],['taxCode','Stripe tax code',13,'txcd_[0-9]{8}']]){
  const td=document.createElement('td'),input=document.createElement('input');input.dataset.key=key;input.setAttribute('aria-label',label);input.value=product[key];input.maxLength=max;input.required=true;if(pattern)input.pattern=pattern;input.autocomplete='off';td.append(input);tr.append(td);
 }
 const td=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.setAttribute('aria-label','Remove product classification');remove.addEventListener('click',()=>{tr.remove();changed();});td.append(remove);tr.append(td);$('setup-products').append(tr);
}
function fields(){return {termsVersion:$('setup-version').value,termsText:$('setup-terms').value,shippingNotes:$('setup-shipping').value,taxNotes:$('setup-tax').value,buyerAccess:$('setup-access').value,products:[...$('setup-products').children].map(tr=>Object.fromEntries([...tr.querySelectorAll('input')].map(input=>[input.dataset.key,input.value])))};}
function showDraft(draft){
 if(!draft||draft.mode!=='test'||draft.state!=='draft'||draft.approved!==false||draft.checkoutActivated!==false||!Number.isSafeInteger(draft.revision)||draft.revision<0||!draft.fields)throw Error('Draft response could not be verified.');
 saved=draft;const f=draft.fields;$('setup-version').value=f.termsVersion;$('setup-terms').value=f.termsText;$('setup-shipping').value=f.shippingNotes;$('setup-tax').value=f.taxNotes;$('setup-access').value=f.buyerAccess;$('setup-products').replaceChildren();for(const p of f.products)row(p);
 $('setup-version-status').textContent=draft.revision?'Saved revision '+draft.revision+' · '+new Date(draft.updatedAt).toLocaleString()+' · NOT APPROVED':'No saved draft yet. Partial drafts can be saved.';
 $('setup-digest').textContent=draft.contentDigest?'Saved content fingerprint: '+draft.contentDigest:'';
 const missing=[];for(const [key,label] of [['termsVersion','Terms version'],['termsText','Purchase terms'],['shippingNotes','Shipping policy'],['taxNotes','Tax review notes']])if(!f[key].trim())missing.push(label);if(f.buyerAccess==='undecided')missing.push('Buyer access');if(!f.products.length)missing.push('Product tax classifications');
 $('setup-missing').textContent=missing.length?'Still to prepare: '+missing.join('; ')+'.':'All draft sections have content. This does not establish correctness or approval.';dirty=false;
}
async function api(view,payload){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
 try{const r=await fetch('/api/shop?'+new URLSearchParams({view}),{credentials:'same-origin',cache:'no-store',signal:abort.signal,...(payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{})});let data;try{data=await r.json();}catch{throw Error('Unreadable setup response. No approval is inferred.');}if(!r.ok){const error=Error(data.error||'Setup request failed.');error.status=r.status;throw error;}return data;}finally{clearTimeout(timer);}
}
async function reload(){
 if(busy()&&phase!=='loading')return;if((dirty||pending)&&!window.confirm('Replace local changes with the current saved draft? An earlier uncertain save may already have succeeded.'))return;
 phase='loading';controls();notice('Reading saved draft and current configuration…');
 try{const result=await api('cart-checkout-setup-status');if(typeof result.storageAvailable!=='boolean'||!result.runtime||result.liveCheckoutEnabled!==false||result.supplierOrderingEnabled!==false)throw Error('Setup status response could not be verified.');
  available=result.storageAvailable;$('setup-runtime').textContent=result.runtime.checked?(result.runtime.testCheckoutReady?'The running preview reports test checkout configured. This draft is not its approved policy.':'The running preview reports test checkout is still held.'): 'Current runtime settings could not be checked.';
  $('setup-blockers').replaceChildren(...result.runtime.blockers.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  if(available)showDraft(result.draft);else{saved=null;$('setup-version-status').textContent='Draft storage requires the configured test merchant.';}
  pending=null;dirty=false;phase='idle';notice(available?'Private draft loaded. No payment or approved policy was changed.':'Setup storage is not configured; editing is disabled.');
 }catch(e){phase=pending?'uncertain':'idle';notice(e.message);}finally{controls();}
}
form.addEventListener('input',changed);form.addEventListener('change',changed);
$('setup-add').addEventListener('click',()=>{if($('setup-products').children.length<100){row();changed();}});
$('setup-reload').addEventListener('click',reload);
form.addEventListener('submit',async event=>{
 event.preventDefault();if($('setup-save').disabled)return;
 if(!pending){if(!form.reportValidity())return;pending={writeId:crypto.randomUUID(),expectedRevision:saved.revision,fields:fields()};}
 phase='saving';controls();notice('Saving and reading back this exact draft…');
 try{const result=await api('cart-checkout-setup-save',pending);if(result.revision!==pending.expectedRevision+1)throw Error('Save returned an unexpected revision. Retry the same request.');showDraft(result);pending=null;phase='idle';notice('Private draft saved and verified. Checkout, tax approvals, shipping charges and buyer access were not changed.');}
 catch(e){if(e.status===400||e.status===413){pending=null;phase='idle';}else phase=e.status===409?'conflict':'uncertain';notice(e.message+(phase==='uncertain'?' Retry the same save; do not start a new edit.':phase==='conflict'?' Reload the saved draft before editing.':''));}
 finally{controls();}
});
window.addEventListener('beforeunload',event=>{if(dirty||pending){event.preventDefault();event.returnValue='';}});
reload();
