const $=id=>document.getElementById(id);
async function load(){
 const button=$('launch-refresh');if(button.disabled)return;button.disabled=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch('/api/shop?view=launch-status',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
  if(r.status===401){$('launch-checks').replaceChildren();location.assign('/login?next=%2Fadmin%2Flaunch');return;}
  const d=await r.json();if(!r.ok)throw Error(d.error||'Readiness could not be loaded.');
  if(d.publicLaunchReady!==false||!Number.isFinite(Date.parse(d.checkedAt))||!Number.isSafeInteger(d.productCounts?.ready)||!Number.isSafeInteger(d.productCounts?.saved)||d.productCounts.ready<0||d.productCounts.ready>d.productCounts.saved||!Array.isArray(d.checks)||d.checks.length>30||d.checks.some(x=>!x||typeof x.state!=='string'||!/^[a-z-]+$/.test(x.state)||typeof x.title!=='string'||typeof x.detail!=='string'))throw Error('Unexpected readiness response.');
  $('launch-status').textContent='Public launch is held. '+d.productCounts.ready+' of '+d.productCounts.saved+' saved review products currently pass the product checks. Updated '+new Date(d.checkedAt).toLocaleString()+'. Configuration is not end-to-end verification.';
  $('launch-checks').replaceChildren(...d.checks.map(x=>{const card=document.createElement('article'),badge=document.createElement('span'),h=document.createElement('h2'),p=document.createElement('p');card.className='launch-check';badge.className='state '+x.state;badge.textContent=x.state.replaceAll('-',' ');h.textContent=x.title;p.textContent=x.detail;card.append(badge,h,p);return card;}));
 }catch(e){$('launch-checks').replaceChildren();$('launch-status').textContent='Current readiness could not be verified. '+(e.name==='AbortError'?'The read timed out; retry Refresh status.':e.message);}
 finally{clearTimeout(timer);button.disabled=false;}
}
$('launch-refresh').addEventListener('click',load);load();
