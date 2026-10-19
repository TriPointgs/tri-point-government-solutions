import {HttpError} from './model.mjs';
export const CONTACT_CONSENT='contact-request-2026-10-19';
export const CONTACT_MAKERS=Object.freeze(['General','Lenovo','Fortinet','Other']);
export const CONTACT_TOPICS=Object.freeze(['Product quote','Procurement assistance','Order support','Profile support','Privacy request','Other']);
const record=x=>x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
function text(x,name,max,{required=false,multiline=false}={}){if(x===undefined||x===null)x='';if(typeof x!=='string')throw new HttpError(400,'Invalid '+name+'.');x=x.trim();if(x.length>max||(required&&!x)||(!multiline&&/[\x00-\x1f\x7f]/.test(x))||(multiline&&/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x)))throw new HttpError(400,'Invalid '+name+'.');return x;}
export function contactId(id){if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new HttpError(400,'Invalid request reference.');return id.toLowerCase();}
export function validateContact(input){
 const allowed=new Set(['organization','name','email','phone','manufacturer','topic','message','deliveryLocation','requiredDate','reference','items','consent','consentVersion','faxNumber','challenge']);
 if(!record(input)||Object.keys(input).some(k=>!allowed.has(k)))throw new HttpError(400,'Unsupported request field.');
 if(input.consent!==true||input.consentVersion!==CONTACT_CONSENT)throw new HttpError(400,'Please agree to the contact-request notice.');
 const email=text(input.email,'email',254,{required:true}).toLowerCase();if(!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(email))throw new HttpError(400,'Enter a valid business email.');
 const manufacturer=text(input.manufacturer||'General','manufacturer',30),topic=text(input.topic||'Product quote','topic',40);if(!CONTACT_MAKERS.includes(manufacturer)||!CONTACT_TOPICS.includes(topic))throw new HttpError(400,'Choose a supported request category.');
 const items=input.items??[];if(!Array.isArray(items)||items.length>15)throw new HttpError(400,'A request can include up to 15 items.');
 const cleanItems=items.map(i=>{if(!record(i)||Object.keys(i).some(k=>!['description','quantity'].includes(k))||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>9999)throw new HttpError(400,'Invalid item or quantity.');return {description:text(i.description,'item description',160,{required:true}),quantity:i.quantity};});
 const requiredDate=text(input.requiredDate,'required date',10);if(requiredDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(requiredDate)||!Number.isFinite(Date.parse(requiredDate+'T00:00:00Z'))||new Date(requiredDate+'T00:00:00Z').toISOString().slice(0,10)!==requiredDate))throw new HttpError(400,'Enter a valid required date.');
 const message=text(input.message,'message',4000,{required:true,multiline:true});if(message.length<10)throw new HttpError(400,'Please describe your request in at least 10 characters.');
 return {organization:text(input.organization,'organization',160,{required:true}),name:text(input.name,'contact name',100,{required:true}),email,phone:text(input.phone,'phone',40),manufacturer,topic,message,items:cleanItems,deliveryLocation:text(input.deliveryLocation,'delivery location',240),requiredDate,reference:text(input.reference,'reference',100),consent:true,consentVersion:CONTACT_CONSENT};
}
export function contactMessage(lead){return {subject:'New Tri-Point website inquiry — '+lead.inquiry.manufacturer,text:['A website inquiry was saved in the private Tri-Point workspace.','Reference: '+lead.id,'Category: '+lead.inquiry.topic,'Manufacturer: '+lead.inquiry.manufacturer,'','Review the request after signing in:','https://tripointgs.com/admin/inquiries','','A request is not a quotation, order, payment, or eligibility approval. This internal alert intentionally excludes buyer details and procurement content.'].join('\n')};}
export function contactConfiguration(env=process.env){
 const preview=env.VERCEL_ENV!=='production',from=env.TP_CONTACT_EMAIL_FROM||env.TP_SIGNUP_EMAIL_FROM||'';
 return {preview,intakeEnabled:preview||env.TP_CONTACT_INTAKE_ENABLED==='true',emailEnabled:!preview&&env.TP_CONTACT_EMAIL_ENABLED==='true'&&!!env.RESEND_API_KEY&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@send\.tripointgs\.com$/i.test(from),from,to:'info@tripointgs.com'};
}
