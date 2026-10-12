const form=document.getElementById('equipment-estimate-form');
const status=document.getElementById('equipment-estimate-status');
const output=document.getElementById('equipment-estimate-output');
const values=document.getElementById('equipment-estimate-values');
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
function parseCents(value,allowZero=false){
  const raw=String(value||'').trim();
  if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(raw))throw Error('Use a valid USD amount with no more than two decimal places.');
  const [d,c='']=raw.split('.');
  const cents=Number(d)*100+Number(c.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents<0||(!allowZero&&cents===0))throw Error('Supplier unit cost must be greater than zero.');
  return cents;
}
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  output.hidden=true;
  values.replaceChildren();
  status.textContent='Calculating private estimate...';
  try{
    const f=new FormData(form);
    const quantity=Number(f.get('quantity'));
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error('Enter a valid quantity.');
    const percent=(name,max)=>{
      const n=Number(f.get(name));
      if(!Number.isFinite(n)||n<0||n>max)throw Error('Enter a valid percentage.');
      return Math.round(n*100);
    };
    const quote={
      quantity,
      unitCostCents:parseCents(f.get('unitCost')),
      freightCents:parseCents(f.get('freight'),true),
      feesCents:parseCents(f.get('fees'),true),
      markupBps:percent('markup',500),
      minMarginBps:percent('margin',89.99),
      minimumProfitCents:parseCents(f.get('minimumProfit'),true)
    };
    const res=await fetch('/api/equipment-admin',{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'estimate',quote})
    });
    if(res.status===401)throw Error('Administrator session required. Sign in at /contractors/admin and try again.');
    if(!res.ok)throw Error('Unable to calculate. Check amounts and your administrator session.');
    const result=await res.json();
    if(result.status!=='DRAFT_ESTIMATE_ONLY'||!result.estimate)throw Error('Unexpected calculation response.');
    const e=result.estimate;
    const rows=[
      ['Landed total supplier cost',money(e.landedCostCents)],
      ['Estimated selling price per unit',money(e.unitSellCents)],
      ['Estimated total selling price',money(e.sellTotalCents)],
      ['Estimated gross profit',money(e.estimatedProfitCents)],
      ['Estimated gross margin',(e.grossMarginBps/100).toFixed(2)+'%']
    ];
    for(const [key,val]of rows){
      const dt=document.createElement('dt');dt.textContent=key;
      const dd=document.createElement('dd');dd.textContent=val;
      values.append(dt,dd);
    }
    output.hidden=false;
    status.textContent='Draft price calculated. Supplier data and buyer eligibility are not verified.';
  }catch(e){
    status.textContent=e instanceof Error?e.message:'Calculation unavailable.';
  }
});
