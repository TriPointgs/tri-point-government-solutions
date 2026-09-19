import { HttpError, SERVICE_IDS, SERVICES, normalize } from './model.mjs';

export const OPPORTUNITY_STATUSES = ['Not Contacted','Draft Ready','Sent','Interested','Declined','Needs More Information','Quote Requested','Quote Received','Selected','Not Selected'];
export const DISCLOSURE_FIELDS = ['summary','scope','location','schedule','requirements','responseDeadline'];
export const REVIEW_FIELDS = ['fullScope','bidNoBid','compliance','pricingProfitability','suppliersSubcontractors','competitorsIncumbents','risksQuestionsDeadlines','awardStrategy'];
const fail = field => { throw new HttpError(400, `Please check the ${field} field.`); };
const object = (v, field) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(field); return v; };
function text(v, field, max=6000) { if (v == null) return ''; if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fail(field); return v.trim(); }
function number(v, field, max=100000000) { if (v == null || v === '') return null; if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v)>max) fail(field); return Number(v); }
function choice(v, values, field, fallback='') { v=v||fallback; if (!values.includes(v)) fail(field); return v; }
function flag(v, field) { if (v==null) return false; if (typeof v!=='boolean') fail(field); return v; }
const strings = (v, fields) => Object.fromEntries(fields.map(k=>[k,text(v[k],k)]));

// Import uses this same whitelist; incoming IDs, matches, messages and approvals are never trusted.
export function validateOpportunity(input) {
 const b=object(input,'opportunity'), r=object(b.requirements||{},'requirements');
 const title=text(b.title,'title',180); if (!title || /[\r\n]/.test(title)) fail('title');
 const state=text(r.state,'state',2).toUpperCase(); if(state&&!/^[A-Z]{2}$/.test(state)) fail('state');
 const internal=strings(object(b.internal||{},'internal'),['source','solicitationUrl','procurementPortal','pricing','margins','bidStrategy','agency','solicitationNumber','deadline','timezone']);
 const disclosure=strings(object(b.disclosure||{},'disclosure'),DISCLOSURE_FIELDS);
 if(Object.values(disclosure).some(value=>/(?:https?:\/\/|www\.)\S+/i.test(value))) throw new HttpError(400,'Remove links from contractor-disclosed information. Keep solicitation links in internal fields.');
 if(internal.solicitationUrl){let url;try{url=new URL(internal.solicitationUrl);}catch{fail('solicitation URL');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('solicitation URL');}
 return {title,requirements:{trade:choice(r.trade,['',...SERVICE_IDS],'trade'),state,county:text(r.county,'county',100),crewSize:number(r.crewSize,'required staffing',100000),maxProject:number(r.maxProject,'project capacity'),insurance:flag(r.insurance,'insurance'),workersComp:flag(r.workersComp,'workers compensation'),licensed:flag(r.licensed,'licensing'),sam:flag(r.sam,'SAM'),role:choice(r.role,['prime','subcontractor'],'role','subcontractor'),...strings(r,['availability','experience','equipment','travel','compliance'])},internal,review:strings(object(b.review||{},'review'),REVIEW_FIELDS),disclosure};
}

export function matchOpportunityContractor(profile, opportunity) {
 const r=opportunity.requirements, rows=[];
 const add=(key,label,requirement,current,result)=>rows.push({key,label,requirement,current:current??null,result});
 const known=(v,test)=>v==null||v===''||v==='unknown'?'Needs confirmation':test(v)?'Declared match':'Needs review';
 add('trade','Trade',r.trade,[profile.trade,...(profile.additionalServices||[])],!r.trade?'Not specified':[profile.trade,...(profile.additionalServices||[])].includes(r.trade)?'Declared match':'Needs review');
 const stateMatch=!r.state||r.state===profile.state;
 const areaMatch=!r.county||(profile.serviceCounties||[]).some(c=>normalize(c)===normalize(r.county))||(profile.statewide&&stateMatch);
 add('geography','Geography',{state:r.state,county:r.county},{state:profile.state,counties:profile.serviceCounties||[],statewide:!!profile.statewide,travelRadius:profile.travelRadius??null},!r.state&&!r.county?'Not specified':stateMatch&&areaMatch?'Declared match':'Needs review');
 add('crewSize','Staffing',r.crewSize,profile.crewSize,r.crewSize==null?'Not specified':known(profile.crewSize,v=>v>=r.crewSize));
 add('maxProject','Project capacity',r.maxProject,profile.maxProject,r.maxProject==null?'Not specified':known(profile.maxProject,v=>v>=r.maxProject));
 for (const [key,label,field] of [['insurance','Insurance','insured'],['workersComp','Workers compensation','workersComp'],['licensed','Licensing','licensed'],['sam','SAM registration','sam']]) add(key,label,r[key],profile[field],!r[key]?'Not specified':known(profile[field],v=>v==='yes'));
 for (const [key,label,current] of [['availability','Availability',profile.availability],['experience','Experience',profile.experience||[]],['equipment','Equipment',profile.equipment],['travel','Travel',profile.travelRadius],['compliance','Other compliance',profile.certifications]]) add(key,label,r[key],current,r[key]?'Needs confirmation':'Not specified');
 return {rows,score:rows.filter(row=>row.result==='Declared match').length,decision:rows.every(row=>row.result==='Not specified')?'Requirements not specified':rows.some(row=>['Needs review','Needs confirmation'].includes(row.result))?'Needs review':'Potential fit',notice:'Preliminary self-reported fit only. Total company staffing is not opportunity availability. Validate the complete solicitation and prime/subcontractor obligations before selection. No travel distance is inferred.'};
}

const PROFILE_LABELS={company:'Company',contact:'Contact',trade:'Primary service',additionalServices:'Additional services',state:'State',serviceCounties:'Service counties',statewide:'Statewide service',travelRadius:'Travel radius (miles)',crewSize:'Total company crew',maxProject:'Maximum project capacity (USD)',yearsInBusiness:'Years in business',experience:'Project experience',licensed:'Licensing',insured:'General liability insurance',workersComp:'Workers compensation',sam:'SAM registration',availability:'Current availability',certifications:'Certifications',equipment:'Equipment'};
const PROFILE_FIELDS=Object.keys(PROFILE_LABELS);
const SERVICE_LABELS=Object.fromEntries(SERVICES);
const VALUE_LABELS={yes:'Yes',no:'No',unknown:'Unknown','not-required':'Not required','in-progress':'In progress',exempt:'Exempt',residential:'Residential',commercial:'Commercial',government:'Government',subcontracting:'Subcontracting','starting-out':'Starting out'};
function display(value,key){
 if(value==null||value===''||(Array.isArray(value)&&!value.length))return 'Not provided';
 if(Array.isArray(value))return value.map(v=>display(v,key)).join(', ');
 if(typeof value==='boolean')return value?'Yes':'No';
 if(key==='trade'||key==='additionalServices')return SERVICE_LABELS[value]||String(value);
 if(['licensed','insured','workersComp','sam','experience'].includes(key))return VALUE_LABELS[value]||String(value);
 return String(value);
}
export function draftOutreach(opportunity, profile) {
 const disclosure=opportunity.disclosure||{};
 if(!DISCLOSURE_FIELDS.some(k=>typeof disclosure[k]==='string'&&disclosure[k].trim())) throw new HttpError(400,'Choose opportunity information to disclose before drafting outreach.');
 const profileSnapshot=Object.fromEntries(PROFILE_FIELDS.map(k=>[k,structuredClone(profile[k]??null)]));
 const labels={summary:'Opportunity summary',scope:'Scope',location:'Location',schedule:'Schedule',requirements:'Requirements',responseDeadline:'Response deadline'};
 const disclosed=DISCLOSURE_FIELDS.filter(k=>disclosure[k]).map(k=>`${labels[k]}: ${disclosure[k]}`).join('\n');
 const current=PROFILE_FIELDS.map(k=>`${PROFILE_LABELS[k]}: ${display(profileSnapshot[k],k)}`).join('\n');
 return {subject:'Tri-Point: please confirm your fit and availability',body:`Hello ${profile.contact||profile.company||'there'},\n\nTri-Point is reviewing potential contractor participation in the following opportunity:\n\n${disclosed}\n\nYour current profile information is listed below. Please confirm which details remain accurate for this specific opportunity and identify any changes.\n\n${current}\n\nFor the scope, location, schedule and requirements disclosed above, please answer:\n1. Are you interested in participating?\n2. What dates can you commit to, and what scheduling conflicts exist?\n3. How many staff can you dedicate to this opportunity? Distinguish available staff from your total company crew.\n4. What project capacity can you commit alongside your current workload?\n5. Can you meet the disclosed insurance and compliance requirements? Confirm coverage limits, workers compensation or exemptions, licenses and any gaps; provide supporting evidence through Tri-Point's approved process.\n6. What comparable project experience and references support this scope?\n7. What equipment is available for this work, and would any need rental or procurement?\n8. Can you travel to and service the disclosed location, and what travel constraints apply?\n9. What additional information do you need before confirming participation?\n\nPlease label permanent company-profile corrections separately from commitments for this opportunity. Tri-Point will review all proposed profile changes. This inquiry is not an award or commitment.\n\nThank you,\nTri-Point Government Solutions`,profileSnapshot};
}

export const PENDING_PROFILE_FIELDS=['trade','additionalServices','serviceCounties','state','statewide','experience','equipment','crewSize','maxProject','travelRadius','yearsInBusiness','availability','insured','workersComp','licensed','sam','certifications','description'];
export const PROFILE_UPDATE_FIELDS=PENDING_PROFILE_FIELDS;
export const CONFIRMATION_FIELDS=['availableStaff','availableCapacity','availability','insurance','experience','equipment','travel','interest','notes'];
export function validatePendingUpdate(input) {
 const b=object(input,'pending profile update'),field=choice(b.field,PENDING_PROFILE_FIELDS,'profile field'); let proposedValue;
 if(['crewSize','maxProject','travelRadius','yearsInBusiness'].includes(field)) { proposedValue=number(b.proposedValue,field,{crewSize:100000,maxProject:100000000,travelRadius:1500,yearsInBusiness:150}[field]);if(proposedValue==null)fail(field); }
 else if(field==='trade')proposedValue=choice(b.proposedValue,SERVICE_IDS,field);
 else if(['additionalServices','serviceCounties','experience'].includes(field)){
  const max={additionalServices:10,serviceCounties:30,experience:5}[field];
  if(!Array.isArray(b.proposedValue)||b.proposedValue.length>max)fail(field);
  proposedValue=[...new Set(b.proposedValue.map(v=>{const value=text(v,field,80);if(!value)fail(field);return value;}))];
  const allowed=field==='additionalServices'?SERVICE_IDS:field==='experience'?['residential','commercial','government','subcontracting','starting-out']:null;
  if(allowed&&proposedValue.some(v=>!allowed.includes(v)))fail(field);
 }
 else if(field==='state'){proposedValue=text(b.proposedValue,field,2).toUpperCase();if(!/^[A-Z]{2}$/.test(proposedValue))fail(field);}
 else if(field==='statewide'){if(typeof b.proposedValue!=='boolean')fail(field);proposedValue=b.proposedValue;}
 else if(['insured','workersComp','licensed','sam'].includes(field)) proposedValue=choice(b.proposedValue,{insured:['yes','no','in-progress','unknown'],workersComp:['yes','no','exempt','unknown'],licensed:['yes','no','not-required','in-progress','unknown'],sam:['yes','no','in-progress','unknown']}[field],field);
 else proposedValue=text(b.proposedValue,field,{availability:150,certifications:300,description:2000,equipment:2000}[field]);
 const evidence=text(b.evidence,'reply or evidence',6000);if(!evidence)fail('reply or evidence');
 return {field,proposedValue,evidence,status:'pending'};
}
export function validateConfirmation(input) {
 const b=object(input,'opportunity confirmation');
 return {availableStaff:number(b.availableStaff,'available staff',100000),availableCapacity:number(b.availableCapacity,'available capacity'),...strings(b,['availability','insurance','experience','equipment','travel','interest','notes'])};
}
