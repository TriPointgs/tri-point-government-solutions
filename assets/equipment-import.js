const catalog=document.getElementById('equipment-import-catalog');
const stock=document.getElementById('equipment-import-stock');
const previous=document.getElementById('equipment-import-previous');
const form=document.getElementById('equipment-import-form');
const status=document.getElementById('equipment-import-status');
const panel=document.getElementById('equipment-import-summary');
const results=document.getElementById('equipment-import-results');

document.getElementById('equipment-load-example')?.addEventListener('click',()=>{
 catalog.value=[
  'sku,mfgPN,manufacturer,description,category,status,priceType,unitCost',
  'SYN-1001,SYN-LAP-01,Example Systems,SYNTHETIC 14-inch business laptop,Computers and workstations,Active,REGULAR,899.50',
  'SYN-1002,SYN-MON-02,Demo Displays,SYNTHETIC 24-inch monitor,Monitors and peripherals,Active,REGULAR,110.00'
 ].join('\n')+'\n';
 previous.value=catalog.value;
 stock.value=[
  'sku,quantity,stockAt',
  'SYN-1001,9,2026-10-11T02:00:00Z',
  'SYN-1002,0,2026-10-11T02:00:00Z'
 ].join('\n')+'\n';
 form.elements.namedItem('mode').value='full';
 form.elements.namedItem('synthetic').checked=true;
 status.textContent='Loaded two synthetic example products. No data has been transmitted.';
});
form?.addEventListener('submit',async event=>{
 event.preventDefault();
 panel.hidden=true;
 results.replaceChildren();
 if(!form.reportValidity())return;
 const data=new FormData(form);
 if(data.get('synthetic')!=='on'){status.textContent='You must confirm synthetic-only records.';return;}
 status.textContent='Validating simulated catalog and stock updates...';
 try{
  const response=await fetch('/api/equipment-import',{
   method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    action:'dryRunSynthetic',confirmSynthetic:true,
    catalogCsv:catalog.value,stockCsv:stock.value,mode:String(data.get('mode')),
    ...(previous.value.trim()?{previousCatalogCsv:previous.value}:{})
   })
  });
  if(response.status===401)throw Error('Administrator sign-in required. Visit /contractors/admin then return.');
  if(response.status===404)throw Error('Synthetic importer is disabled for production.');
  if(!response.ok)throw Error('Validation rejected this synthetic file. Check the format, SKU coverage, duplicates, quantities and timestamps.');
  const report=await response.json();
  if(report.source!=='SYNTHETIC_ONLY'||report.safeForCustomerQuote!==false||report.summary?.persisted!==false){
   throw Error('Unexpected import response: refused to display.');
  }
  const rows=[
   ['Product records',report.summary.rows],
   ['Unique synthetic SKUs',report.summary.uniqueSkus],
   ['Unpriced products',report.summary.unpriced],
   ['Unknown stock',report.summary.stockUnknown],
   ['Zero stock',report.summary.zeroStock??'Not provided'],
   ['Inventory changes',report.summary.stockChangeCount??0],
   ['Catalog SHA-256',report.catalogDigest],
   ['Stock SHA-256',report.stockDigest],
   ['Published','No'],
   ['Persisted','No'],
   ['Supplier API called','No']
  ];
  for(const [key,value]of rows){
   const dt=document.createElement('dt'),dd=document.createElement('dd');
   dt.textContent=key;dd.textContent=String(value??'Not provided');
   results.append(dt,dd);
  }
  if(report.changeControl){
    const compare=report.changeControl;
    if(compare.canAutoPublish!==false||compare.persisted!==false||!compare.counts)
      throw Error('Unexpected change-control result.');
    const comparisonRows=[
      ['Previous catalog SKUs',compare.counts.prior],
      ['Current catalog SKUs',compare.counts.current],
      ['New entries',compare.counts.added],
      ['Removed entries',compare.counts.removed],
      ['Modified entries',compare.counts.modified],
      ['Supplier price changes',compare.counts.priceChanges],
      ['Product status changes',compare.counts.statusChanges],
      ['Removed share of old catalog',compare.removedPercent+'%'],
      ['Changed share of old catalog',compare.changedPercent+'%'],
      ['Hard stops',compare.hardStops.length?compare.hardStops.join(' | '):'None detected'],
      ['Manual review required',compare.requiresManualReview?'Yes':'No'],
      ['Automatically publishable','No']
    ];
    for(const [key,value]of comparisonRows){
      const dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=key;dd.textContent=String(value);
      results.append(dt,dd);
    }
  }
  panel.hidden=false;
  status.textContent='Synthetic validation completed. No data was saved or published.';
 }catch(error){status.textContent=error instanceof Error?error.message:'Validation could not be completed.';}
});
