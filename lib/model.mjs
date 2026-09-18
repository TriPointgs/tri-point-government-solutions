export const SERVICES = [
 ['janitorial','Janitorial & commercial cleaning'],['landscaping','Landscaping & grounds maintenance'],['hvac','HVAC'],['electrical','Electrical'],['plumbing','Plumbing'],['construction','General construction'],['roofing','Roofing'],['painting','Painting'],['flooring','Flooring'],['pressure-washing','Pressure washing'],['pest-control','Pest control'],['towing','Towing & recovery'],['fleet','Automotive & fleet services'],['printing','Printing & mailing'],['apparel','Screen printing, embroidery & uniforms'],['promotional','Promotional products'],['moving','Moving & relocation'],['transportation','Transportation & delivery'],['maintenance','Facility & equipment maintenance'],['fencing','Fencing'],['concrete','Concrete & asphalt'],['signage','Signage'],['technology','Technology & IT'],['supplies','Equipment & supplies'],['other','Other services']
];
export const COUNTIES=['Lake','Orange','Seminole','Osceola','Volusia','Marion','Sumter','Brevard','Polk','Hillsborough','Pinellas','Pasco','Broward','Miami-Dade','Palm Beach','Duval'];
export const SERVICE_IDS=SERVICES.map(x=>x[0]);
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const bad=(field)=>{throw new HttpError(400,`Please check the ${field} field.`);};
function text(value,field,max,required=false){if(value==null)value='';if(typeof value!=='string')bad(field);value=value.trim();if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value))bad(field);return value;}
function choice(value,allowed,field,fallback='unknown'){value=value||fallback;if(!allowed.includes(value))bad(field);return value;}
function list(value,field,max=16){if(value==null)return [];if(!Array.isArray(value)||value.length>max)bad(field);return [...new Set(value.map(x=>text(x,field,80,true)))];}
function number(value,field,max){if(value===''||value==null)return null;if(!/^[0-9]+$/.test(String(value)))bad(field);const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>max)bad(field);return n;}
export function validateApplication(b){
 if(!b||typeof b!=='object'||Array.isArray(b))bad('application');
 if(b.consent!==true)throw new HttpError(400,'Please agree to the network terms and application contact permission.');
 const email=text(b.email,'email',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))bad('email');
 const zip=text(b.zip,'ZIP code',5,true);if(!/^\d{5}$/.test(zip))bad('ZIP code');
 const state=text(b.state||'FL','state',2,true).toUpperCase();if(!/^[A-Z]{2}$/.test(state))bad('state');
 const trade=choice(b.trade,SERVICE_IDS,'primary service','');
 const additionalServices=list(b.additionalServices,'additional services',10);if(additionalServices.some(x=>!SERVICE_IDS.includes(x)))bad('additional services');
 const experience=list(b.experience,'experience',5);if(experience.some(x=>!['residential','commercial','government','subcontracting','starting-out'].includes(x)))bad('experience');
 const interests=list(b.interests,'interests',5);if(interests.some(x=>!['subcontracting','teaming','prime','guidance'].includes(x)))bad('interests');
 const website=text(b.website,'website',250);if(website){let u;try{u=new URL(website);}catch{bad('website');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)bad('website');}
 const source=choice(b.source,['direct','facebook','instagram','linkedin','email','partner','other'],'source','direct');
 const campaign=text(b.campaign,'campaign',64);const referral=text(b.referral,'referral',18);
 return {company:text(b.company,'company name',120,true),contact:text(b.contact,'contact name',100,true),email,phone:text(b.phone,'phone',40),website,trade,additionalServices,zip,state,serviceCounties:list(b.serviceCounties,'service counties',30),statewide:b.statewide===true,travelRadius:number(b.travelRadius,'travel radius',1500),crewSize:number(b.crewSize,'crew size',100000),maxProject:number(b.maxProject,'project capacity',100000000),yearsInBusiness:number(b.yearsInBusiness,'years in business',150),experience,interests,licensed:choice(b.licensed,['yes','no','not-required','in-progress','unknown'],'licensing'),insured:choice(b.insured,['yes','no','in-progress','unknown'],'insurance'),workersComp:choice(b.workersComp,['yes','no','exempt','unknown'],'workers compensation'),sam:choice(b.sam,['yes','no','in-progress','unknown'],'SAM registration'),availability:text(b.availability,'availability',150),certifications:text(b.certifications,'certifications',300),description:text(b.description,'project description',2000),alertsOptIn:b.alertsOptIn===true,source,campaign:/^[a-zA-Z0-9_-]{0,64}$/.test(campaign)?campaign:'',referral:/^[a-f0-9]{18}$/.test(referral)?referral:'',consent:true,consentVersion:'network-2026-09-18',verification:'self-reported'};
}
export const normalize=x=>String(x||'').toLowerCase().replace(/ county$/,'').trim();
export function matchContractor(p,n){
 const reasons=[],gaps=[];
 const serviceMatch=!n.trade||p.trade===n.trade||(p.additionalServices||[]).includes(n.trade);
 const stateMatch=!n.state||p.state===n.state;
 const locationMatch=!n.county||((p.serviceCounties||[]).some(x=>normalize(x)===normalize(n.county)))||(p.statewide&&stateMatch);
 if(serviceMatch)reasons.push('Declared service matches');else gaps.push('Service does not match');
 if(locationMatch&&stateMatch)reasons.push('Declared service area matches');else gaps.push('Service area needs confirmation; no distance is inferred from ZIP codes');
 if(n.value>0){if(p.maxProject==null)gaps.push('Project capacity unknown');else if(p.maxProject<n.value)gaps.push('Requirement exceeds declared project capacity');else reasons.push('Within declared project capacity');}
 if(n.insurance&&p.insured!=='yes')gaps.push('General liability insurance needs confirmation');
 if(n.workersComp&&p.workersComp!=='yes')gaps.push('Workers compensation or an acceptable exemption needs review');
 if(n.sam&&n.role==='prime'&&p.sam!=='yes')gaps.push('Prime SAM registration needs confirmation');
 if(n.sam&&n.role!=='prime')gaps.push('Check whether the solicitation imposes registration requirements on this subcontractor');
 return {serviceMatch,locationMatch:locationMatch&&stateMatch,reasons,gaps,decision:gaps.length?'Needs review':'Potential fit',notice:'Self-reported capabilities only. Review the complete solicitation, references, licenses, insurance, pricing, capacity and prime/subcontract restrictions before any bid decision.'};
}
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
