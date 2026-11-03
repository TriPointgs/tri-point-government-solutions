const page=document.querySelector('[data-brand]');
if(page){
 const cards=[...page.querySelectorAll('[data-product-card]')],search=page.querySelector('#brand-search'),legacy=page.querySelector('#brand-show-legacy');
 let category='all';const chosen=new Set();
 const count=page.querySelector('#brand-result-count');
 const filter=()=>{const q=search.value.trim().toLowerCase();let visible=0;for(const card of cards){card.hidden=!(category==='all'||card.dataset.category===category)||!card.dataset.search.includes(q)||(card.dataset.legacy==='true'&&!legacy?.checked);if(!card.hidden)visible++;}count.textContent=`${visible} ${visible===1?'product':'products'} shown`;page.querySelector('#brand-empty').hidden=visible>0;};
 page.querySelectorAll('[data-catalog-toolbar],[data-compare-control],[data-legacy-control]').forEach(x=>x.hidden=false);
 for(const button of page.querySelectorAll('[data-category-filter]'))button.addEventListener('click',()=>{category=button.dataset.categoryFilter;page.querySelectorAll('[data-category-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));filter();});
 search.addEventListener('input',filter);legacy?.addEventListener('change',filter);
 page.querySelector('#brand-reset').addEventListener('click',()=>{category='all';search.value='';if(legacy)legacy.checked=false;page.querySelectorAll('[data-category-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.categoryFilter==='all')));filter();search.focus();});
 const sync=()=>{page.querySelector('#brand-compare-tray').hidden=chosen.size===0;page.querySelector('#brand-compare-count').textContent=chosen.size+' selected';page.querySelectorAll('[data-compare]').forEach(x=>{x.checked=chosen.has(x.dataset.compare);x.disabled=chosen.size===3&&!x.checked;});};
 page.querySelectorAll('[data-compare]').forEach(x=>x.addEventListener('change',()=>{x.checked?chosen.add(x.dataset.compare):chosen.delete(x.dataset.compare);sync();}));
 page.querySelector('#brand-compare-clear').addEventListener('click',()=>{chosen.clear();sync();});
 const dialog=page.querySelector('#brand-compare-dialog');let opener=null;
 page.querySelector('#brand-compare-open').addEventListener('click',event=>{opener=event.currentTarget;const grid=document.createElement('div');grid.className='brand-comparison-grid';grid.style.setProperty('--compare-columns',String(chosen.size));for(const id of chosen){const card=cards.find(x=>x.dataset.id===id),section=document.createElement('section');for(const selector of ['img','h3','.brand-product-description','.brand-features','.brand-specs','.brand-variants','.brand-quote']){const found=card.querySelector(selector);if(found){const node=found.cloneNode(true);node.removeAttribute('id');node.removeAttribute('loading');section.append(node);}}grid.append(section);}page.querySelector('#brand-compare-content').replaceChildren(grid);dialog.showModal();});
 page.querySelector('#brand-compare-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>opener?.focus());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 for(const card of cards){card.querySelector('.brand-product-image').addEventListener('click',()=>{card.querySelector('details').open=true;});}
 const revealHash=()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const target=document.getElementById(id),card=target?.closest('[data-product-card]');if(card){search.value='';category='all';if(legacy&&card.dataset.legacy==='true')legacy.checked=true;page.querySelectorAll('[data-category-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.categoryFilter==='all')));filter();card.querySelector('details').open=true;target.scrollIntoView({block:'start'});}};
 filter();revealHash();window.addEventListener('hashchange',revealHash);
}
