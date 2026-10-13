import {createHash} from 'node:crypto';
import {HttpError} from './model.mjs';
import {text,object} from './zoom-model.mjs';

export const DISTRIBUTOR_DRAFT_VERSION='carahsoft-pricing-request-v1';
export const DISTRIBUTOR_ALLOWED_DISCLOSURE=['organization','rfq','provider'];

function reject(field){throw new HttpError(400,'Invalid '+field+'.');}
export function distributorDisclosure(value){
 const v=object(value||{},'distributor disclosure');
 if(Object.keys(v).some(k=>!DISTRIBUTOR_ALLOWED_DISCLOSURE.includes(k)))reject('disclosure field');
 const result={};
 for(const key of DISTRIBUTOR_ALLOWED_DISCLOSURE){
  if(v[key]!==undefined&&typeof v[key]!=='boolean')reject('disclosure consent');
  result[key]=v[key]===true;
 }
 return result;
}
function safeLine(value,max=240){
 const v=String(value??'').trim();
 if(/[\r\n\u0000-\u001f\u007f]/.test(v)||v.length>max)reject('distributor email field');
 return v;
}
export function distributorDraft(lead,disclosure){
 const d=distributorDisclosure(disclosure),i=lead.inquiry||{},w=lead.workflow||{};
 if(typeof lead.id!=='string'||!Number.isSafeInteger(lead.revision))reject('lead record');
 const product=safeLine(i.product||'Product to confirm',100);
 const orgType=safeLine(i.organizationType||'Not specified',100);
 const quantity=w.seatEstimate??i.seats;
 const seats=quantity==null?'To be confirmed':String(quantity);
 const renewal=safeLine(i.renewalDate||'',30),when=safeLine(i.quoteDeadline||'',30),zone=safeLine(i.deadlineTimezone||'',80);
 const lines=[
  'Hello,',
  '',
  'Tri-Point Government Solutions LLC is requesting distributor pricing guidance for the following potential Zoom licensing requirement.',
  '',
  'Requested product/category: '+product,
  'Organization category: '+orgType,
  'Request type: '+safeLine(i.requestType||'Not specified',100),
  'Estimated seat count: '+safeLine(seats,20),
  ...(renewal?['Current expiration / renewal date: '+renewal]:[]),
  ...(when?['Requested quotation deadline: '+when+(zone?' ('+zone+')':'')]:[]),
  ...(d.organization?['End-user organization (expressly selected for disclosure): '+safeLine(i.organization,160)]:[]),
  ...(d.rfq&&i.solicitationNumber?['Solicitation/RFQ reference (expressly selected for disclosure): '+safeLine(i.solicitationNumber,150)]:[]),
  ...(d.provider&&i.currentProvider?['Existing product/provider (expressly selected for disclosure): '+safeLine(i.currentProvider,300)]:[]),
  '',
  'Please confirm the appropriate SKU or license configuration, customer eligibility (including education/public-sector requirements where applicable), subscription term, price basis, lead time, any transfer/renewal requirements, and quote validity.',
  '',
  'No purchase commitment or price has been approved. Please advise what additional information is required before a formal reseller quotation can be prepared.',
  '',
  'Thank you,',
  'Tri-Point Government Solutions LLC'
 ];
 const subject='Zoom distributor pricing inquiry — '+product;
 const body=lines.join('\n');
 // No customer contact email/phone, internal cost/margin, notes, or opportunity-source links may enter this template.
 const digest=createHash('sha256').update(JSON.stringify({leadId:lead.id,revision:lead.revision,version:DISTRIBUTOR_DRAFT_VERSION,disclosure:d,subject,body})).digest('hex');
 return {version:DISTRIBUTOR_DRAFT_VERSION,leadId:lead.id,revision:lead.revision,disclosure:d,subject,body,digest,warning:'Private staff draft only. Nothing has been emailed. Review the entire text and explicitly authorize any end-user information before manually contacting your distributor.'};
}
export function validateSentRecord(input,expected){
 const b=object(input,'distributor send record');
 if(b.confirm!==true||b.acknowledgedManualSend!==true)throw new HttpError(400,'Confirm you personally sent the reviewed request before recording it as sent.');
 const digest=text(b.digest,'reviewed draft fingerprint',64,true);
 if(!/^[a-f0-9]{64}$/.test(digest)||digest!==expected.digest)throw new HttpError(409,'The reviewed draft is outdated. Generate and review it again.');
 const recipient=text(b.recipient,'recipient email',254,true).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||/[\r\n]/.test(recipient))reject('recipient email');
 const reference=text(b.reference,'manual send evidence',500,true);
 if(reference.length<8)reject('manual send evidence');
 return {recipient,reference,disclosure:expected.disclosure,digest};
}
