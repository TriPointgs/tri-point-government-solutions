// One explicit user-triggered SerpApi search per button, never a background refresh.
// Research candidates are not saved as approved retail-price observations.
const $=id=>document.getElementById(id);
const el=(tag,text,klass)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(klass)e.className=klass;return e;};
const dollars=c=>c===null||c===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
let activeId=null,inFlight=false,seq=0;
export function resetShoppingCandidates(productId){
 activeId=productId;seq++;$('serpapi-candidates')?.replaceChildren();
 $('serpapi-indicative').textContent='';$('serpapi-matching').textContent='';$('serpapi-toggle-offtarget').hidden=true;
 $('serpapi-status').textContent='Not searched. Each search button may use one SerpApi credit.';
}
export async function fetchShoppingCandidates(mode='shopping'){
 if(inFlight||!activeId)return;
 const id=activeId,requested=++seq,button=$('serpapi-fetch'),other=$('serpapi-exact-web');
 inFlight=true;button.disabled=true;other.disabled=true;
 $('serpapi-status').textContent='Checking '+(mode==='exact_web'?'exact-part retail web listings':'Google Shopping')+'… one server-side request. Results will be saved as unverified research, not approved retail offers.';
 try{
  const r=await fetch('/api/product-controls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'marketSearch',id,mode}),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000)});
  let data;try{data=await r.json();}catch{throw Error('Search response was not readable.');}
  if(r.status===401){$('market-price-dialog').close();location.assign('/login');return;}
  if(!r.ok)throw Error(data.error||'Shopping research failed.');
  if(id!==activeId||requested!==seq)return;
  if(data.researchSummary)document.dispatchEvent(new CustomEvent('research-report-updated',{detail:{id,summary:data.researchSummary,saved:data.researchSummarySaved??data.researchSaved}}));
  $('serpapi-status').textContent='Search completed '+new Date(data.checkedAt).toLocaleString()+' · '+data.totalReturned+' '+(data.mode==='exact_web'?'web results':'shopping results')+' · '+data.exactTitleMatches+' show the complete part number in searchable fields. Results remain unverified. '+(data.researchSaved===true?'Research summary saved.':data.saveWarning||'');
  $('serpapi-indicative').textContent=data.mode==='exact_web'?'Web results are product-page leads, not confirmed prices. Open the retailer listing to check actual price and stock.':
   data.preliminaryAverageCents===null?'No preliminary multi-source average from strict title matches. This is not an error.':
   'Unverified title-match indicator: '+dollars(data.preliminaryAverageCents)+' from '+data.preliminarySourceCount+' distinct store labels. Not an approved or published retail average.';
  const matches=data.candidates.filter(c=>c.exactPartVisible),others=data.candidates.filter(c=>!c.exactPartVisible);
  $('serpapi-matching').textContent=matches.length===0?'No exact manufacturer part match. Do not average these prices. '+(data.mode==='shopping'?'Try Exact-part web listings for retailer product pages.':'Verify vendor product pages directly.'):'Showing '+matches.length+' exact-part research leads first; '+others.length+' off-target results separated below.';
  const toggle=$('serpapi-toggle-offtarget');toggle.hidden=others.length===0;toggle.textContent='Show '+others.length+' unrelated results';toggle.setAttribute('aria-expanded','false');
  if(data.mode==='exact_web'){
   const hints=matches.filter(c=>c.priceHintCents!==null&&c.priceHintCents!==undefined);
   const excluded=hints.filter(c=>['backorder_or_zero','out_of_stock'].includes(c.availabilitySignal?.status)).length;
   const held=hints.filter(c=>['supplier_order','unknown'].includes(c.availabilitySignal?.status)).length;
   $('serpapi-indicative').textContent=hints.length+' exact-part search price hints; '+excluded+' indicate backorder/out of stock, '+held+' require stock confirmation. The saved research average includes non-stocked offers; it is not a verified in-stock price.';
  }
  const body=$('serpapi-candidates');body.replaceChildren();
  for(const c of [...matches,...others]){
   if(!c.exactPartVisible&&body.querySelector('.serpapi-offtarget')===null){const tr=el('tr'),td=el('td','Off-target or missing complete part number — excluded from any price benchmark.','serpapi-offtarget');td.colSpan=4;tr.hidden=true;tr.className='serpapi-irrelevant';tr.append(td);body.append(tr);}
   const row=el('tr'),info=el('td');info.append(el('strong',c.title),el('small',c.source||'Unidentified store'));if(c.snippet)info.append(el('small',c.snippet));
   const price=el('td'),assessment=el('td');
   if(c.priceCents!==null&&c.priceCents!==undefined)price.append(el('strong',dollars(c.priceCents)),el('small','Unverified Google Shopping item price'));
   else if(c.priceHintCents!==null&&c.priceHintCents!==undefined)price.append(el('strong',dollars(c.priceHintCents)),el('small','Search-snippet hint only — requires retailer verification'));
   else price.textContent='Unavailable';
   assessment.append(el('span',c.exactPartVisible?'Part number visible':'Part number not visible'));if(c.availabilitySignal)assessment.append(el('small','Availability: '+c.availabilitySignal.status.replaceAll('_',' ')+' — '+c.availabilitySignal.note));assessment.append(el('small',c.issues.join('; ')));
   const source=el('td'),url=c.vendorLink||c.googleProductLink||c.researchLink;
   if(url){const a=el('a',c.vendorLink?'Inspect retailer listing':c.googleProductLink?'Inspect Google product':'Find retailer page via Google');a.href=url;a.rel='noopener noreferrer';a.target='_blank';source.append(a);}else source.textContent='No usable product link';
   if(!c.exactPartVisible){row.className='serpapi-irrelevant';row.hidden=true;}row.append(info,price,assessment,source);body.append(row);
  }
  if(!data.candidates.length){const tr=el('tr'),td=el('td','No candidate results. This does not imply a zero-dollar market price.');td.colSpan=4;tr.append(td);body.append(tr);}
 }catch(e){if(requested===seq)$('serpapi-status').textContent=e.message+' — no candidate prices saved.';}
 finally{inFlight=false;button.disabled=false;other.disabled=false;}
}
function toggleUnrelated(){
 const button=$('serpapi-toggle-offtarget'),expanded=button.getAttribute('aria-expanded')!=='true';
 button.setAttribute('aria-expanded',String(expanded));
 for(const row of $('serpapi-candidates').querySelectorAll('.serpapi-irrelevant'))row.hidden=!expanded;
 button.textContent=(expanded?'Hide':'Show')+' unrelated results';
}
export function attachShoppingUI(){
 const button=$('serpapi-fetch');if(button)button.addEventListener('click',()=>fetchShoppingCandidates('shopping'));
 const exact=$('serpapi-exact-web');if(exact)exact.addEventListener('click',()=>fetchShoppingCandidates('exact_web'));const toggle=$('serpapi-toggle-offtarget');if(toggle)toggle.addEventListener('click',toggleUnrelated);
}
