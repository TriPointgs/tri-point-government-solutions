const $=id=>document.getElementById(id),form=$('setup-form');
let saved=null,pending=null,phase='loading',available=false,dirty=false;
let policyCandidate=null,policyPending=null,policyBusy=false,policyApproved=false;
const busy=()=>['loading','saving'].includes(phase);
const notice=text=>{$('setup-status').textContent=text;};
function controls(){
 $('setup-fields').disabled=!available||busy()||!!pending||policyBusy||!!policyPending;
 $('setup-save').disabled=!available||busy()||policyBusy||!!policyPending||phase==='conflict'||(!dirty&&!pending);
 $('setup-save').textContent=phase==='uncertain'?'Retry same draft save':'Save private draft';
 $('setup-reload').disabled=busy()||policyBusy||!!policyPending;
 $('setup-export').hidden=!saved?.revision||dirty||!!pending||busy();
 $('setup-add').disabled=$('setup-products').children.length>=100;
 $('desktop-policy-load').disabled=!saved?.revision||dirty||!!pending||busy()||policyBusy||!!policyPending;
 $('desktop-policy-approve').disabled=policyApproved||policyBusy||busy()||dirty||!!pending||!policyCandidate||
  (!$('desktop-policy-review').checked||!$('desktop-policy-test').checked);
 $('desktop-policy-approve').textContent=policyPending?'Retry same sandbox policy approval':'Approve sandbox policy';
}
function changed(){dirty=true;policyApproved=false;policyCandidate=null;$('desktop-policy-content').hidden=true;notice('Unsaved changes. Save the draft before reviewing the sandbox policy.');controls();}
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
 policyCandidate=null;policyApproved=false;$('desktop-policy-content').hidden=true;
 $('desktop-policy-review').checked=false;$('desktop-policy-test').checked=false;
 saved=draft;const f=draft.fields;$('setup-version').value=f.termsVersion;$('setup-terms').value=f.termsText;$('setup-shipping').value=f.shippingNotes;$('setup-tax').value=f.taxNotes;$('setup-access').value='account';$('setup-access-status').textContent=f.buyerAccess==='account'?'Saved draft matches the account-required policy.':draft.revision?'This historical draft has an older access choice. Saving this draft will align it with the account-required policy.':'Account required is selected; customer accounts are not activated.';$('setup-products').replaceChildren();for(const p of f.products)row(p);
 $('setup-version-status').textContent=draft.revision?'Saved revision '+draft.revision+' · '+new Date(draft.updatedAt).toLocaleString()+' · NOT APPROVED':'No saved draft yet. Partial drafts can be saved.';
 $('setup-digest').textContent=draft.contentDigest?'Saved content fingerprint: '+draft.contentDigest:'';
 const missing=[];for(const [key,label] of [['termsVersion','Terms version'],['termsText','Purchase terms'],['shippingNotes','Shipping policy'],['taxNotes','Tax review notes']])if(!f[key].trim())missing.push(label);if(f.buyerAccess!=='account')missing.push('Align historical buyer-access choice when saving');if(!f.products.length)missing.push('Product tax classifications');
 $('setup-missing').textContent=missing.length?'Still to prepare: '+missing.join('; ')+'.':'All draft sections have content. This does not establish correctness or approval.';dirty=false;
}
async function api(view,payload){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
 try{const r=await fetch('/api/shop?'+new URLSearchParams({view}),{credentials:'same-origin',cache:'no-store',signal:abort.signal,...(payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{})});let data;try{data=await r.json();}catch{throw Error('Unreadable setup response. No approval is inferred.');}if(!r.ok){const error=Error(data.error||'Setup request failed.');error.status=r.status;throw error;}return data;}finally{clearTimeout(timer);}
}
async function readPolicyStatus(){
 try{
  const result=await api('cart-checkout-setup-desktop-status');
  if(result.mode!=='test'||typeof result.approved!=='boolean'||result.checkoutActivated!==false||
   result.liveCheckoutEnabled!==false||result.supplierOrderingEnabled!==false)throw Error('Sandbox policy status could not be verified.');
  if(result.approved&&(!Number.isSafeInteger(result.policyRevision)||result.policyRevision<1||!Number.isFinite(Date.parse(result.expiresAt))))
   throw Error('Saved sandbox approval details could not be verified.');
  policyApproved=result.approved;
  $('desktop-policy-status').textContent=policyApproved?
   'Sandbox policy revision '+result.policyRevision+' is approved until '+new Date(result.expiresAt).toLocaleString()+'. Checkout activation is a separate step.':
   'This saved draft has no current desktop sandbox approval. Load the policy for review.';
 }catch(error){policyApproved=false;$('desktop-policy-status').textContent=error.message;}
}
async function reload(){
 if(busy()&&phase!=='loading')return;if((dirty||pending)&&!window.confirm('Replace local changes with the current saved draft? An earlier uncertain save may already have succeeded.'))return;
 phase='loading';controls();notice('Reading saved draft and current configuration…');
 try{const result=await api('cart-checkout-setup-status');if(typeof result.storageAvailable!=='boolean'||!result.runtime||result.liveCheckoutEnabled!==false||result.supplierOrderingEnabled!==false)throw Error('Setup status response could not be verified.');
  available=result.storageAvailable;$('setup-runtime').textContent=result.runtime.checked?(result.runtime.testCheckoutReady?'The running preview reports test checkout configured. This draft is not its approved policy.':'The running preview reports test checkout is still held.'): 'Current runtime settings could not be checked.';
  $('setup-blockers').replaceChildren(...result.runtime.blockers.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  if(available)showDraft(result.draft);else{saved=null;$('setup-version-status').textContent='Draft storage requires the configured test merchant.';}
  pending=null;dirty=false;phase='idle';notice(available?'Private draft loaded. No payment or approved policy was changed.':'Setup storage is not configured; editing is disabled.');
  if(available)await readPolicyStatus();
 }catch(e){phase=pending?'uncertain':'idle';notice(e.message);}finally{controls();}
}
form.addEventListener('input',changed);form.addEventListener('change',changed);
$('setup-add').addEventListener('click',()=>{if($('setup-products').children.length<100){row();changed();}});
$('setup-reload').addEventListener('click',reload);
form.addEventListener('submit',async event=>{
 event.preventDefault();if($('setup-save').disabled)return;
 if(!pending){if(!form.reportValidity())return;pending={writeId:crypto.randomUUID(),expectedRevision:saved.revision,fields:fields()};}
 phase='saving';controls();notice('Saving and reading back this exact draft…');
 try{const result=await api('cart-checkout-setup-save',pending);if(result.revision!==pending.expectedRevision+1)throw Error('Save returned an unexpected revision. Retry the same request.');showDraft(result);pending=null;phase='idle';await readPolicyStatus();notice('Private draft saved and verified. Checkout, tax approvals, shipping charges and buyer access were not changed.');}
 catch(e){if(e.status===400||e.status===413){pending=null;phase='idle';}else phase=e.status===409?'conflict':'uncertain';notice(e.message+(phase==='uncertain'?' Retry the same save; do not start a new edit.':phase==='conflict'?' Reload the saved draft before editing.':''));}
 finally{controls();}
});
$('desktop-policy-load').addEventListener('click',async()=>{
 if($('desktop-policy-load').disabled)return;
 policyBusy=true;policyCandidate=null;controls();
 $('desktop-policy-status').textContent='Reading the saved draft and preparing the exact test policy…';
 try{
  const candidate=await api('cart-checkout-setup-desktop-candidate');
  if(candidate.mode!=='test'||candidate.state!=='owner-review-required'||
   candidate.draftRevision!==saved.revision||candidate.scope?.kind!=='desktop-sandbox-v1'||
   candidate.scope.sku!=='14784711'||candidate.scope.manufacturerPart!=='13B90032US'||
   candidate.scope.quantity!==1||!candidate.terms?.text||!candidate.candidateDigest)
   throw Error('The desktop review response could not be verified.');
  policyCandidate=candidate;
  const a=candidate.scope.address;
  $('desktop-policy-scope').textContent='One Lenovo desktop · TD SKU 14784711 · Lenovo part 13B90032US · '+[a.line1,a.city,a.state,a.postalCode,a.country].join(', ');
  $('desktop-policy-tax').textContent='Test classification '+candidate.tax.code+'. Required delivery is included in the taxable base. Freight, stock, price and tax are refreshed for the order.';
  $('desktop-policy-terms').textContent=candidate.terms.text;
  $('desktop-policy-review').checked=false;$('desktop-policy-test').checked=false;
  $('desktop-policy-content').hidden=false;
  $('desktop-policy-status').textContent=policyApproved?'This saved draft already has a current sandbox approval. The reviewed scope is shown below.':
   'Review the test policy for saved draft revision '+candidate.draftRevision+'. Approval lasts '+candidate.expiresInHours+' hours.';
 }catch(error){$('desktop-policy-content').hidden=true;$('desktop-policy-status').textContent=error.message;}
 finally{policyBusy=false;controls();}
});
for(const id of ['desktop-policy-review','desktop-policy-test'])$(id).addEventListener('change',controls);
$('desktop-policy-approve').addEventListener('click',async()=>{
 if($('desktop-policy-approve').disabled)return;
 if(!policyPending)policyPending={writeId:crypto.randomUUID(),draftRevision:policyCandidate.draftRevision,
  candidateDigest:policyCandidate.candidateDigest,testConsent:true,reviewConsent:true};
 policyBusy=true;controls();$('desktop-policy-status').textContent='Saving the exact reviewed sandbox policy…';
 try{
  const result=await api('cart-checkout-setup-desktop-approve',policyPending);
  if(result.mode!=='test'||result.approved!==true||result.checkoutActivated!==false||result.liveCheckoutEnabled!==false||result.supplierOrderingEnabled!==false||
   !Number.isSafeInteger(result.policyRevision)||result.policyRevision<1||!Number.isFinite(Date.parse(result.expiresAt)))
   throw Error('The saved sandbox policy could not be confirmed. Retry this same approval.');
  policyPending=null;policyCandidate=null;policyApproved=true;$('desktop-policy-content').hidden=true;
  $('desktop-policy-status').textContent='Sandbox policy revision '+result.policyRevision+' saved and verified. Valid until '+new Date(result.expiresAt).toLocaleString()+'. Checkout activation is a separate step.';
 }catch(error){
  if([400,409,413].includes(error.status)){policyPending=null;policyCandidate=null;$('desktop-policy-content').hidden=true;}
  $('desktop-policy-status').textContent=error.message+(policyPending?' Retry this same approval to verify the result.':' Reload the policy before reviewing again.');
 }finally{policyBusy=false;controls();}
});
window.addEventListener('beforeunload',event=>{if(dirty||pending||policyPending){event.preventDefault();event.returnValue='';}});
reload();
