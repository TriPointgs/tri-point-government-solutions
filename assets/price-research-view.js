// Presentation helpers: administrator-only values, explicitly distinct from publishable selling prices.
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
export function amountText(c,currency=null){if(c===null||c===undefined)return 'Not returned';return new Intl.NumberFormat('en-US',currency==='USD'?{style:'currency',currency:'USD'}:{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100);}
export function ageText(time){if(!time)return '';const n=Math.max(0,Math.floor((Date.now()-Date.parse(time))/60000));return n<1?'less than a minute ago':n<60?n+' minutes ago':Math.floor(n/60)+'h '+n%60+'m ago';}
export function renderTdContext(element,c){
 element.replaceChildren();if(!c){element.append(node('strong','TD price not returned'),node('small','Run Check selected with TD to retrieve a supplier observation.'));return;}
 element.append(node('strong',amountText(c.lastAmountCents,c.currency)),node('small',c.status+' · '+c.environment),node('small',c.currencyConfirmed?'TD acquisition price · USD':'TD amount · currency unconfirmed'),node('small',(c.fresh?'Recent observation':'Last known observation — expired')+' · '+ageText(c.checkedAt)),node('small',new Date(c.checkedAt).toLocaleString()));
 if(c.latestCheckFailed)element.append(node('small','Latest refresh failed; prior successful amount shown, not current.'));
 element.append(node('small','Last reported quantity: '+(c.lastReportedQuantity??'unknown')+(c.fresh?'':' · not current stock')));
}
export function renderIndicativePrice(element,c,approved){
 element.replaceChildren();
 if(c?.indicativePriceCents!==null&&c?.indicativePriceCents!==undefined){element.append(node('strong',amountText(c.indicativePriceCents,c.currency)),node('small',(c.markupBps/100)+'% markup · '+c.rule),node('small','Internal estimate — NOT an approved selling price'),node('small',c.currencyConfirmed?'Excludes freight, fees and tax.':'Same unconfirmed currency as TD; no currency conversion.'));}
 else element.append(node('strong','Estimate unavailable'),node('small','A matched TD acquisition amount is needed.'));
 if(approved!==null&&approved!==undefined)element.append(node('small','Reviewed suggested USD price: '+amountText(approved,'USD')));
}
export function renderResearchCell(cell,s){
 let wrap=cell.querySelector('[data-research-content]');if(!wrap){wrap=node('div');wrap.dataset.researchContent='true';cell.prepend(wrap);}wrap.replaceChildren();
 if(s?.readError){wrap.append(node('strong','Research report not loaded'),node('small','Refresh the saved list; no additional search is required.'));return;}
 if(!s?.hasSavedSearch){wrap.append(node('strong','No saved research yet'),node('small','Run one price search; its summary will stay saved.'));return;}
 wrap.append(node('strong',s.averageCents===null?'Not enough usable prices':'$'+amountText(s.averageCents)),node('small',(s.expired?'Last research average — expired':'Research average — unverified')),node('small',s.pricedSources+' priced / '+s.exactSources+' exact-source groups · '+s.returnedListings+' returned listings'),node('small','Dollar symbols treated as USD for research only; includes non-stocked offers.'),node('small','Search fetched '+new Date(s.newestAt).toLocaleString()));
}
export function renderResearchReport(s,{saved=true}={}){
 const stats=document.getElementById('research-report-stats'),note=document.getElementById('research-report-note'),table=document.getElementById('research-report-sources');if(!stats||!note||!table)return;
 stats.replaceChildren();table.replaceChildren();
 if(!s?.hasSavedSearch){note.textContent=s?.readError?'The saved research report could not be loaded. No new search was run.':'No search report has been saved yet. Run an exact-part search once; reopening this panel will reuse the saved report without spending another credit.';return;}
 const range=s.pricedSources?'$'+amountText(s.lowCents)+' – $'+amountText(s.highCents):'—';
 for(const [label,value]of [['Research average',s.averageCents===null?'—':'$'+amountText(s.averageCents)],['Median',s.medianCents===null?'—':'$'+amountText(s.medianCents)],['Price range',range],['Price-bearing sources',s.pricedSources],['Sources without a price',s.missingPriceSources],['Returned listings',s.returnedListings]]){const d=node('div');d.append(node('span',label),node('strong',value));stats.append(d);}
 note.textContent=(saved?'Saved research report. ':'Temporary report — saving failed. ')+(s.expired?'EXPIRED observations; shown for historical reference. ':'')+s.pricedSources+' usable prices from '+s.exactSources+' distinct exact-part source groups, across '+s.returnedListings+' returned listings. Missing prices are excluded, never counted as zero. '+s.currencyBasis+' '+s.stockBasis+' Search fetched '+new Date(s.newestAt).toLocaleString()+'.';
 for(const r of s.sourceRows||[]){const tr=node('tr');tr.append(node('td',r.source||r.sourceKey),node('td',r.amountCents===null?'Not found':'$'+amountText(r.amountCents)),node('td',r.included?'Included in research only':r.amountCents===null?'No numeric price':'Excluded: '+(r.excluded?.join('; ')||r.currencyEvidence)),node('td',(r.availability||'unknown').replaceAll('_',' ')));table.append(tr);}
}
