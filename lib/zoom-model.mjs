import {HttpError,csvCell} from './model.mjs';
export const ZOOM_ORG_TYPES=['Private Business','K–12 School','Higher Education','Federal Government','State Government','Local Government','Nonprofit','Other'];
export const ZOOM_PRODUCTS=['Zoom Workplace','Zoom Phone','Zoom for Government','Zoom Education','Renewal','Unsure'];
export const ZOOM_REQUEST_TYPES=['New licenses','Existing customer renewal','Additional seats','Unsure'];
export const ZOOM_STATUSES=['New','Researching','Qualified','Awaiting Carahsoft','Pricing Received','Quote Submitted','Follow-Up','Won','Lost'];
export const ZOOM_CONSENT_VERSION='zoom-quote-contact-2026-10-12';
const bad=field=>{throw new HttpError(400,'Please check the '+field+' field.');};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function object(value,field){if(!value||typeof value!=='object'||Array.isArray(value))bad(field);return value;}
export function text(value,field,max=300,required=false){if(value==null)value='';if(typeof value!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))bad(field);value=value.trim();if(value.length>max||(required&&!value))bad(field);return value;}
function choice(value,allowed,field){if(!allowed.includes(value))bad(field);return value;}
function integer(value,field,max=1000000){if(value===''||value==null)return null;if(!/^\d+$/.test(String(value)))bad(field);const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>max)bad(field);return n;}
export function date(value,field){const v=text(value,field,10);if(!v)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(v))bad(field);const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)bad(field);return v;}
function timezone(value){const v=text(value,'deadline time zone',80);if(!v)return '';try{new Intl.DateTimeFormat('en-US',{timeZone:v}).format();}catch{bad('deadline time zone');}return v;}
function deadline(value){const v=text(value,'quotation deadline',16);if(!v)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return date(v,'quotation deadline');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))bad('quotation deadline');date(v.slice(0,10),'quotation deadline');if(Number(v.slice(11,13))>23||Number(v.slice(14,16))>59)bad('quotation deadline');return v;}
export function validateZoomInquiry(input){
 const b=object(input,'quote request');
 if(b.consent!==true||b.consentVersion!==ZOOM_CONSENT_VERSION)throw new HttpError(400,'Please review the current contact consent and agree before submitting.');
 const email=text(b.email,'business email',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n]/.test(email))bad('business email');
 const quoteDeadline=deadline(b.quoteDeadline),deadlineTimezone=timezone(b.deadlineTimezone);
 if(quoteDeadline.includes('T')&&!deadlineTimezone)bad('deadline time zone');
 return {organization:text(b.organization,'organization name',160,true),contact:text(b.contact,'contact name',100,true),email,
 phone:text(b.phone,'telephone',40),organizationType:choice(b.organizationType,ZOOM_ORG_TYPES,'organization type'),
 product:choice(b.product,ZOOM_PRODUCTS,'product of interest'),requestType:choice(b.requestType,ZOOM_REQUEST_TYPES,'request type'),
 seats:integer(b.seats,'license estimate'),currentProvider:text(b.currentProvider,'current provider or product',300),
 renewalDate:date(b.renewalDate,'renewal date'),solicitationNumber:text(b.solicitationNumber,'solicitation or RFQ number',150),
 quoteDeadline,deadlineTimezone,notes:text(b.notes,'additional notes',4000),consent:true,consentVersion:ZOOM_CONSENT_VERSION};
}
export function moneyToCents(value,field){
 if(value===''||value==null)return null;
 if(typeof value!=='string'&&!Number.isFinite(value))bad(field);
 const v=String(value);if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(v))bad(field);
 const [whole,fraction='']=v.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export function financials(lead){const {quoteCents,costCents}=lead.finance;return {profitCents:quoteCents==null||costCents==null?null:quoteCents-costCents,marginPercent:quoteCents>0&&costCents!=null?Math.round((quoteCents-costCents)/quoteCents*10000)/100:null};}
export function safeDocument(input){const d=object(input,'bid document');const label=text(d.label,'document label',160,true),value=text(d.url,'document link',2000,true);let u;try{u=new URL(value);}catch{bad('document link');}if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(u.hostname))bad('document link');return {label,url:u.href};}
export function validateAdminPatch(input){
 const b=object(input,'lead update');const allowed=['status','assignedTo','followUpDate','renewalReminderDate','productEstimate','seatEstimate','quoteAmount','distributorCost','priceBasis','documents'];
 if(Object.keys(b).some(k=>!allowed.includes(k)))throw new HttpError(400,'This lead update contains a protected or unsupported field.');
 const out={};if(own(b,'status'))out.status=choice(b.status,ZOOM_STATUSES,'lead status');if(own(b,'assignedTo'))out.assignedTo=text(b.assignedTo,'assigned team member',120);
 for(const k of ['followUpDate','renewalReminderDate'])if(own(b,k))out[k]=date(b[k],k);
 if(own(b,'productEstimate'))out.productEstimate=text(b.productEstimate,'product estimate',1000);
 if(own(b,'seatEstimate'))out.seatEstimate=integer(b.seatEstimate,'internal seat estimate');
 if(own(b,'quoteAmount'))out.quoteCents=moneyToCents(b.quoteAmount,'quote amount');if(own(b,'distributorCost'))out.costCents=moneyToCents(b.distributorCost,'distributor cost');if(own(b,'priceBasis'))out.priceBasis=text(b.priceBasis,'pricing basis',500);
 if(own(b,'documents')){if(!Array.isArray(b.documents)||b.documents.length>20)bad('document links');out.documents=b.documents.map(safeDocument);}
 return out;
}
export function dateInZone(now=new Date(),zone='America/New_York'){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=k=>parts.find(x=>x.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');}
export function dueFlags(lead,today=dateInZone()){
 if(['Won','Lost'].includes(lead.workflow.status))return {followUp:false,renewal:false};
 return {followUp:!!lead.workflow.followUpDate&&lead.workflow.followUpDate<=today,renewal:!!lead.workflow.renewalReminderDate&&lead.workflow.renewalReminderDate<=today};
}
export function matchesLead(lead,filters={},today=dateInZone()){
 if(!filters.includeTests&&lead.isTest)return false;
 if(filters.status&&lead.workflow.status!==filters.status)return false;
 if(filters.product&&lead.inquiry.product!==filters.product)return false;
 if(filters.assignedTo&&lead.workflow.assignedTo.toLowerCase()!==filters.assignedTo.toLowerCase())return false;
 const q=String(filters.q||'').toLowerCase();if(q&&!['organization','contact','email','solicitationNumber','currentProvider'].some(k=>lead.inquiry[k].toLowerCase().includes(q)))return false;
 const due=dueFlags(lead,today);if(filters.due==='follow-up'&&!due.followUp)return false;if(filters.due==='renewal'&&!due.renewal)return false;
 return true;
}
export function leadSummary(lead,today){return {id:lead.id,revision:lead.revision,createdAt:lead.createdAt,isTest:lead.isTest,organization:lead.inquiry.organization,contact:lead.inquiry.contact,email:lead.inquiry.email,product:lead.inquiry.product,seats:lead.inquiry.seats,renewalDate:lead.inquiry.renewalDate,quoteDeadline:lead.inquiry.quoteDeadline,deadlineTimezone:lead.inquiry.deadlineTimezone,...lead.workflow,notificationStatus:lead.notification.status,due:dueFlags(lead,today)};}
export function leadsCsv(leads){const columns=['Reference','Organization','Contact','Business email','Telephone','Organization type','Product','Request type','Seats','Renewal date','RFQ number','Quote deadline','Deadline time zone','Status','Assigned to','Follow-up','Renewal reminder','Quote USD','Distributor cost USD','Estimated gross margin %','Pricing basis','Test record'];const rows=leads.map(l=>[l.id,l.inquiry.organization,l.inquiry.contact,l.inquiry.email,l.inquiry.phone,l.inquiry.organizationType,l.inquiry.product,l.inquiry.requestType,l.inquiry.seats,l.inquiry.renewalDate,l.inquiry.solicitationNumber,l.inquiry.quoteDeadline,l.inquiry.deadlineTimezone,l.workflow.status,l.workflow.assignedTo,l.workflow.followUpDate,l.workflow.renewalReminderDate,l.finance.quoteCents==null?'':(l.finance.quoteCents/100).toFixed(2),l.finance.costCents==null?'':(l.finance.costCents/100).toFixed(2),financials(l).marginPercent,l.finance.priceBasis,l.isTest?'Yes':'No']);return '\uFEFF'+[columns,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');}
