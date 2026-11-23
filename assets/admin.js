import {matchContractor,csvCell,SERVICES,escapeHtml as e,normalize} from './model.mjs';
const login=document.querySelector('#admin-login'),directory=document.querySelector('#directory'),message=document.querySelector('#admin-message'),recordsEl=document.querySelector('#records'),filters=document.querySelector('#filters'),more=document.querySelector('#load-more');let records=[],cursor=null,visible=[],busy=false,welcomeEnabled=false;
const status=(text,error=false)=>{message.textContent=text;message.classList.toggle('error',error);};
const decisionLabel=s=>({new:'New',reviewed:'Under review',approved:'Approved for network',declined:'Declined',suspended:'Suspended'})[s||'new']||'Under review';
const welcomeLabel=s=>({'held':'Not sent — delivery disabled','attempted':'Send attempted — confirm provider result','provider-accepted':'Accepted by email provider (not proof of delivery)','outcome-unknown':'Sending outcome uncertain — do not retry automatically'})[s||'held']||'Not sent';
async function loadNotifications(){
 try{
  const res=await fetch('/api/notifications',{cache:'no-store',credentials:'same-origin'});
  if(!res.ok)return;
  const data=await res.json();const count=Number(data.newCount||0);welcomeEnabled=data.welcomeEmailEnabled===true;
  const el=document.querySelector('#new-signups-count');
  if(el)el.textContent=(count===0?'No unreviewed subcontractor applications':count+' new subcontractor application'+(count===1?'':'s')+' awaiting review')+(data.emailEnabled?' · Internal application alerts enabled':' · Internal application alerts not configured')+(welcomeEnabled?' · Welcome emails enabled':' · Welcome emails not enabled');
 }catch{console.warn('Notification count could not load.');}
}

async function request(method='GET',body=null,pageCursor=null){const url='/api/admin'+(pageCursor?'?cursor='+encodeURIComponent(pageCursor):'');const r=await fetch(url,{method,cache:'no-store',credentials:'same-origin',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});let b;try{b=await r.json();}catch{throw new Error('The service returned an unreadable response.');}if(!r.ok){if(r.status===401){login.hidden=false;directory.hidden=true;records=[];recordsEl.replaceChildren();}throw new Error(b.error||'Request failed.');}return b;}
function render(){const fd=new FormData(filters);const n={trade:String(fd.get('trade')||''),county:String(fd.get('county')||''),state:'',role:String(fd.get('role')||'subcontractor'),value:Number(fd.get('value')||0),insurance:fd.has('insurance'),workersComp:fd.has('workersComp'),sam:fd.has('sam')};const query=normalize(fd.get('query'));visible=records.map(p=>({p,m:matchContractor(p,n)})).filter(({p,m})=>m.serviceMatch&&m.locationMatch&&(!query||normalize(p.company+' '+p.contact+' '+p.email).includes(query)));document.querySelector('#record-count').textContent=`Showing ${visible.length} of ${records.length} loaded applications${cursor?' — more pages available.':'.'}`;recordsEl.innerHTML=visible.length?visible.map(({p,m})=>`<article class="card record"><span class="tag">Self-reported · ${e(decisionLabel(p.status))}</span><h3>${e(p.company)}</h3><p class="meta">${e(p.contact)} · ${e(p.email)}${p.phone?' · '+e(p.phone):''}<br>${e(SERVICES.find(x=>x[0]===p.trade)?.[1]||p.trade)} · ZIP ${e(p.zip)}, ${e(p.state)}<br>Received ${e(p.submittedAt)} · Ref ${e(p.id)}</p><p><strong>Area:</strong> ${e((p.serviceCounties||[]).join(', ')||'Not supplied')}${p.statewide?' · Statewide':''}<br><strong>Crew:</strong> ${e(p.crewSize??'Unknown')} · <strong>Capacity:</strong> ${p.maxProject==null?'Unknown':'$'+Number(p.maxProject).toLocaleString()}<br><strong>License:</strong> ${e(p.licensed)} · <strong>Liability insurance:</strong> ${e(p.insured)} · <strong>Workers’ comp:</strong> ${e(p.workersComp)} · <strong>SAM:</strong> ${e(p.sam)}</p><p class="result-label">${e(m.decision)}</p><p>${e([...m.reasons,...m.gaps].join(' · '))}</p><details><summary>Application details</summary><p><strong>Experience:</strong> ${e((p.experience||[]).join(', ')||'Not supplied')}<br><strong>Interests:</strong> ${e((p.interests||[]).join(', ')||'Not supplied')}<br><strong>Availability:</strong> ${e(p.availability||'Not supplied')}<br><strong>Certifications (unverified):</strong> ${e(p.certifications||'Not supplied')}<br><strong>Website:</strong> ${e(p.website||'Not supplied')}<br><strong>Travel radius:</strong> ${e(p.travelRadius??'Unknown')} miles<br><strong>Years in business:</strong> ${e(p.yearsInBusiness??'Unknown')}</p><pre>${e(p.description||'No project description supplied.')}</pre><p class="fine">Future marketing opt-in: ${p.alertsOptIn?'Yes':'No'} · Source: ${e(p.source)} · Campaign: ${e(p.campaign||'None')} · Referred by: ${e(p.referral||'None')}<br>Consent version: ${e(p.consentVersion)}</p>${!p.status||p.status==='new'?`<button type="button" class="secondary" data-reviewed="${e(p.id)}">Mark under review</button>`:''}${p.status==='reviewed'?`<button type="button" data-decision="approve" data-id="${e(p.id)}">Approve for network</button><button type="button" class="secondary" data-decision="decline" data-id="${e(p.id)}">Decline application</button>`:''}${p.status==='reviewed'||p.status==='approved'?`<button type="button" class="secondary" data-welcome-preview="${e(p.id)}">Preview welcome email</button><pre class="notice-preview" data-welcome-output="${e(p.id)}" hidden></pre>`:''}${p.status==='approved'?`<p class="fine">Welcome email: ${e(welcomeLabel(p.welcomeNotice?.state))}. This approval does not verify credentials or guarantee work.</p>${welcomeEnabled&&p.welcomeNotice?.state==='held'?`<button type="button" data-send-welcome="${e(p.id)}">Send held welcome email</button>`:''}`:''}<button type="button" class="danger" data-delete="${e(p.id)}">Delete this application</button></details></article>`).join(''):'<div class="empty">No matching applications among the records loaded. New applications will appear here after submission.</div>';more.hidden=!cursor;}
async function load(reset=false){if(busy)return;busy=true;more.disabled=true;status('Loading private applications…');try{const b=await request('GET',null,reset?null:cursor);if(reset)records=[];const seen=new Set(records.map(x=>x.id));records.push(...b.records.filter(x=>!seen.has(x.id)));cursor=b.cursor;login.hidden=true;directory.hidden=false;render();status('');await loadNotifications();}catch(error){status(error.message,true);}finally{busy=false;more.disabled=false;}}
login.addEventListener('submit',async event=>{event.preventDefault();const button=login.querySelector('button');button.disabled=true;try{await request('POST',{action:'login',password:login.elements.password.value});login.reset();await load(true);}catch(error){status(error.message,true);}finally{button.disabled=false;}});
filters.addEventListener('submit',event=>event.preventDefault());filters.addEventListener('input',render);filters.addEventListener('change',render);more.addEventListener('click',()=>load());document.querySelector('#refresh').addEventListener('click',()=>load(true));document.querySelector('#logout').addEventListener('click',async()=>{try{await request('POST',{action:'logout'});records=[];visible=[];recordsEl.replaceChildren();directory.hidden=true;login.hidden=false;status('Signed out.');}catch(error){status(error.message,true);}});
document.querySelector('#export').addEventListener('click',()=>{const fields=['id','submittedAt','company','contact','email','phone','trade','zip','state','serviceCounties','statewide','travelRadius','crewSize','maxProject','yearsInBusiness','licensed','insured','workersComp','sam','experience','interests','certifications','availability','description','alertsOptIn','source','campaign','referral','consentVersion','verification'];const csv=[fields,...visible.map(({p})=>fields.map(f=>Array.isArray(p[f])?p[f].join('; '):p[f]))].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='tripoint-private-contractors.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Exported the visible loaded profiles. Keep this file private.');});
recordsEl.addEventListener('click',async event=>{const button=event.target.closest('button[data-delete]');if(!button)return;const id=button.dataset.delete;const p=records.find(x=>x.id===id);if(!p||!confirm(`Permanently delete the application for ${p.company}? This removes the stored profile.`))return;button.disabled=true;try{await request('DELETE',{action:'delete',id,confirm:true});records=records.filter(x=>x.id!==id);render();status('Application deleted.');}catch(error){status(error.message,true);button.disabled=false;}});
// An existing session is checked without exposing profile data before server authorization.
load(true);

recordsEl.addEventListener('click',async event=>{
 const preview=event.target.closest('button[data-welcome-preview]');
 if(preview){
  const id=preview.dataset.welcomePreview;
  const el=recordsEl.querySelectorAll('[data-welcome-output]');
  const output=[...el].find(x=>x.dataset.welcomeOutput===id);
  if(!output)return;
  preview.disabled=true;
  try{
   const res=await fetch('/api/notifications?view=welcome-preview&id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'Email preview unavailable.');
   output.hidden=false;
   output.textContent='TO: '+data.to+'\nSUBJECT: '+data.subject+'\n\n'+data.text+
    '\n\nPREVIEW ONLY — this action did not send email.';
   status('Preview loaded; no email was sent.');
  }catch(error){status(error.message,true);}finally{preview.disabled=false;}
  return;
 }
 const sendWelcome=event.target.closest('button[data-send-welcome]');
 if(sendWelcome){
  const id=sendWelcome.dataset.sendWelcome;
  const p=records.find(x=>x.id===id);
  if(!p||p.status!=='approved'||p.welcomeNotice?.state!=='held'||!welcomeEnabled)return;
  if(!confirm('Send the previously prepared welcome email to '+p.email+'? This is a single attempt and cannot be retried automatically.'))return;
  sendWelcome.disabled=true;
  try{
   const res=await fetch('/api/notifications',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'send-welcome',id,confirmed:true})});
   const result=await res.json();
   if(!res.ok)throw new Error(result.error||'Welcome email attempt could not be completed.');
   p.welcomeNotice={state:result.welcomeNotice};
   render();status('Welcome email: '+welcomeLabel(result.welcomeNotice)+'.');
  }catch(error){sendWelcome.disabled=false;status(error.message,true);}
  return;
 }
 const reviewed=event.target.closest('button[data-reviewed]');
 const decision=event.target.closest('button[data-decision]');
 const button=reviewed||decision;
 if(!button)return;
 const id=reviewed?.dataset.reviewed||decision.dataset.id;
 const p=records.find(x=>x.id===id);
 if(!p)return;
 const action=reviewed?'mark-reviewed':decision.dataset.decision;
 if(action==='approve'){
  const msg='Approve '+p.company+' for participation in the Tri-Point subcontractor network? This does not verify credentials or guarantee work.'+
   (welcomeEnabled?' A single welcome email attempt is enabled.':' Welcome emails are DISABLED, so approval will NOT send email.');
  if(!confirm(msg))return;
 }else if(action==='decline'){
  if(!confirm('Decline the network application for '+p.company+'? No decline email will be sent.'))return;
 }
 button.disabled=true;
 try{
  const res=await fetch('/api/notifications',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action,id,expectedStatus:p.status||'new',confirmed:true})});
  const result=await res.json();
  if(!res.ok)throw new Error(result.error||'Unable to update application status.');
  p.status=result.status;
  if(result.reviewedAt)p.reviewedAt=result.reviewedAt;
  if(result.approvedAt)p.approvedAt=result.approvedAt;
  if(result.declinedAt)p.declinedAt=result.declinedAt;
  if(action==='approve')p.welcomeNotice={state:result.welcomeNotice};
  render();await loadNotifications();
  if(action==='approve')status('Application approved. Welcome email: '+welcomeLabel(result.welcomeNotice)+'.');
  else if(action==='decline')status('Application declined. No email was sent.');
  else status('Application marked under review. No email was sent.');
 }catch(error){button.disabled=false;status(error.message,true);}
});
