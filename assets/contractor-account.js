import {escapeHtml as e,SERVICES} from './model.mjs';
const panel=document.querySelector('#account-panel'),notice=document.querySelector('#account-message');
function status(text,error=false){notice.textContent=text;notice.classList.toggle('error',error);}
async function request(method='GET',body){
 const response=await fetch('/api/contractor-profile',{method,credentials:'same-origin',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load your profile.');return data;
}
const input=(name,label,value='',type='text')=>'<label class="field">'+label+'<input name="'+name+'" type="'+type+'" value="'+e(value??'')+'"></label>';
const choice=(name,label,value,options)=>'<label class="field">'+label+'<select name="'+name+'">'+options.map(([id,text])=>'<option value="'+e(id)+'"'+(id===value?' selected':'')+'>'+e(text)+'</option>').join('')+'</select></label>';
function render(p){
 const services=SERVICES.map(x=>[x[0],x[1]]);
 const statuses=[['unknown','Not sure'],['yes','Yes'],['no','No'],['in-progress','In progress']];
 panel.innerHTML='<h2>'+e(p.company)+'</h2><p class="fine">Signed in as '+e(p.email)+'. This is your company profile only; no contract sources, competing companies, projects or bid pipeline are shown.</p>'+
 '<form id="profile-edit" class="panel"><div class="field-grid">'+
 input('contact','Contact person',p.contact)+input('phone','Phone',p.phone)+
 input('website','Website',p.website,'url')+choice('trade','Primary service',p.trade,services)+
 input('state','State (two letters)',p.state)+input('serviceCounties','Counties served (comma-separated)',(p.serviceCounties||[]).join(', '))+
 input('travelRadius','Travel radius (miles)',p.travelRadius,'number')+
 input('crewSize','Total company crew',p.crewSize,'number')+
 input('maxProject','Comfortable project capacity ($)',p.maxProject,'number')+
 input('availability','Current availability',p.availability)+
 choice('insured','General liability insurance',p.insured,statuses)+
 choice('licensed','Licensing',p.licensed,[...statuses,['not-required','Not required']])+
 choice('workersComp','Workers compensation',p.workersComp,[['unknown','Not sure'],['yes','Yes'],['no','No'],['exempt','Exempt; subject to verification']])+
 input('certifications','Certifications (unverified)',p.certifications)+
 input('equipment','Equipment summary',p.equipment)+
 '</div><label class="check"><input type="checkbox" name="statewide"'+(p.statewide?' checked':'')+'><span>Available statewide within the state listed above</span></label>'+
 '<p class="fine">Updated capability and compliance statements may require verification. A company-wide crew size is not a promise of project-specific availability. To change the legal company name or sign-in email, contact Tri-Point.</p><button type="submit">Save my company profile</button></form>'+
 '<div class="actions"><button id="contractor-logout" class="secondary">Sign out</button></div>';
 const form=document.querySelector('#profile-edit');
 form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try{
   const d=new FormData(form),fields=['contact','phone','website','trade','state','availability','insured','licensed','workersComp','certifications','equipment'];
   const changes=Object.fromEntries(fields.map(name=>[name,String(d.get(name)||'')]));
   changes.serviceCounties=String(d.get('serviceCounties')||'').split(',').map(x=>x.trim()).filter(Boolean);
   changes.statewide=d.get('statewide')==='on';
   for(const name of ['travelRadius','crewSize','maxProject']){if(d.get(name)!=='')changes[name]=Number(d.get(name));}
   const result=await request('POST',{action:'update',changes});
   render(result.profile);status('Saved '+result.updatedFields+' changed field(s). Regulated capability statements remain subject to review.');
  }catch(ex){status(ex.message,true);}finally{button.disabled=false;}
 });
 document.querySelector('#contractor-logout').addEventListener('click',async()=>{try{await fetch('/api/contractor-auth',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});}finally{location.assign('/login');}});
}
request().then(data=>render(data.profile)).catch(ex=>{status(ex.message,true);panel.innerHTML='<p>Sign in using the company email previously provided in your subcontractor application.</p><a class="button" href="/login">Go to sign in</a>';});
