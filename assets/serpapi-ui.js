// Research candidates are intentionally kept separate from reviewed retail evidence.
const $=id=>document.getElementById(id);
const el=(tag,text,klass)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(klass)x.className=klass;return x;};
const dollars=c=>c===null||c===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
let activeId=null,inFlight=false,seq=0;
export function resetShoppingCandidates(productId){activeId=productId;seq++;$('serpapi-candidates')?.replaceChildren();$('serpapi-indicative').textContent='';$('serpapi-status').textContent='Not searched. Each click requests one Google Shopping search and may use one SerpApi credit.';}
export async function fetchShoppingCandidates(){
 if(inFlight||!activeId)return;
 const id=activeId,requested=++seq,button=$('serpapi-fetch');inFlight=true;button.disabled=true;
 $('serpapi-status').textContent='Checking Google Shopping candidates… one server-side request. No prices are being saved.';
 try{
  const r=await fetch('/api/product-controls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'marketSearch',id}),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000)});
  let data;try{data=await r.json();}catch{throw Error('Search response was not readable.');}
  if(r.status===401){$('market-price-dialog').close();location.assign('/login');return;}
  if(!r.ok)throw Error(data.error||'Shopping research failed.');
  if(id!==activeId||requested!==seq)return;
  $('serpapi-status').textContent='Search completed '+new Date(data.checkedAt).toLocaleString()+' · '+data.totalReturned+' shopping results · '+data.exactTitleMatches+' display the complete part number. Results are unverified.';
  $('serpapi-indicative').textContent=data.preliminaryAverageCents===null?'No preliminary multi-source average from strict title matches. This is not an error.':'Unverified title-match indicator: '+dollars(data.preliminaryAverageCents)+' from '+data.preliminarySourceCount+' distinct source labels. Not an approved or published retail average.';
  const body=$('serpapi-candidates');body.replaceChildren();for(const c of data.candidates){const row=el('tr'),info=el('td');info.append(el('strong',c.title),el('small',c.source||'Unidentified seller'));const price=el('td',dollars(c.priceCents)),assessment=el('td');assessment.append(el('span',c.exactPartVisible?'Part number visible':'Part number not visible'),el('small',c.issues.join('; ')));const source=el('td');if(c.googleProductLink){const a=el('a','Inspect Google product');a.href=c.googleProductLink;a.rel='noopener noreferrer';a.target='_blank';source.append(a);}else source.textContent='No safe product link';row.append(info,price,assessment,source);body.append(row);}
  if(!data.candidates.length){const tr=el('tr'),td=el('td','No candidate results. Do not treat this as a zero-dollar market price.');td.colSpan=4;tr.append(td);body.append(tr);}
 }catch(e){if(requested===seq)$('serpapi-status').textContent=e.message+' — no candidate prices saved.';}
 finally{inFlight=false;button.disabled=false;}
}
export function attachShoppingUI(){const button=$('serpapi-fetch');if(button)button.addEventListener('click',fetchShoppingCandidates);}
