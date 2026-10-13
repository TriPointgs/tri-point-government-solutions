import {createHash} from 'node:crypto';
import {HttpError} from './model.mjs';
import {text,date,financials} from './zoom-model.mjs';
export const CUSTOMER_QUOTE_VERSION='tri-point-zoom-quotation-v1';
const bad=field=>{throw new HttpError(400,'Please check '+field+'.');};
export function validateCustomerQuoteTerms(input,today){
 if(!input||typeof input!=='object'||Array.isArray(input))bad('quotation terms');
 const allowed=['licenseTerm','validUntil','taxTreatment','delivery','exclusions','distributorReference'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))bad('quotation terms');
 const licenseTerm=text(input.licenseTerm,'license term',250,true);
 const validUntil=date(input.validUntil,'quote validity');
 if(!validUntil||validUntil<today)bad('validity date');
 const taxTreatment=text(input.taxTreatment,'tax treatment',180,true);
 const delivery=text(input.delivery,'provisioning or delivery conditions',800,true);
 const exclusions=text(input.exclusions,'exclusions',1000,true);
 const distributorReference=text(input.distributorReference,'verified distributor quote reference',220,true);
 return {licenseTerm,validUntil,taxTreatment,delivery,exclusions,distributorReference};
}
const inline=value=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const dollars=cents=>'$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function createCustomerQuoteDraft(lead,terms,today){
 const t=validateCustomerQuoteTerms(terms,today),i=lead.inquiry,w=lead.workflow,f=lead.finance;
 if(!i||!w||!f||['Won','Lost'].includes(w.status))throw new HttpError(409,'Closed or incomplete leads cannot be quoted.');
 if(!Number.isSafeInteger(w.seatEstimate)||w.seatEstimate<=0)bad('approved license quantity');
 if(!w.productEstimate?.trim())bad('specific product/license configuration');
 if(!f.priceBasis?.trim())bad('quote price period and basis');
 if(!Number.isSafeInteger(f.quoteCents)||f.quoteCents<=0||!Number.isSafeInteger(f.costCents)||f.costCents<0)bad('proposed quote and verified distributor cost');
 const margin=financials(lead);
 const subject='Tri-Point Zoom licensing quotation — '+inline(i.organization);
 const body=[
  'Tri-Point Government Solutions LLC','Zoom licensing quotation',
  '',
  'Quotation reference: '+lead.id,
  'Prepared for: '+i.organization,
  'Attention: '+i.contact,
  'Requested product: '+i.product,
  'Proposed license configuration: '+w.productEstimate,
  'Estimated seats/licenses: '+w.seatEstimate,
  'Term: '+t.licenseTerm,
  'Price basis: '+f.priceBasis,
  'Proposed total price (USD): '+dollars(f.quoteCents),
  'Taxes: '+t.taxTreatment,
  'Provisioning/delivery conditions: '+t.delivery,
  'Exclusions and assumptions: '+t.exclusions,
  'Quote valid through: '+t.validUntil,
  '',
  'Subject to final customer eligibility, publisher/distributor confirmation, any required legal or procurement terms, and a separately accepted written order. This quotation draft is not an invoice or order confirmation.',
  'Tri-Point Government Solutions LLC','info@tripointgs.com'
 ].join('\n');
 const fingerprint=createHash('sha256').update(JSON.stringify({
  version:CUSTOMER_QUOTE_VERSION,leadId:lead.id,buyer:i.organization,contact:i.contact,email:i.email,
  product:i.product,productEstimate:w.productEstimate,seats:w.seatEstimate,priceCents:f.quoteCents,
  costCents:f.costCents,priceBasis:f.priceBasis,terms:t,subject,body
 })).digest('hex');
 return {version:CUSTOMER_QUOTE_VERSION,id:lead.id,subject,body,fingerprint,terms:t,priceCents:f.quoteCents,costCents:f.costCents,
  profitCents:margin.profitCents,marginPercent:margin.marginPercent,seatEstimate:w.seatEstimate,
  note:'PRIVATE STAFF REVIEW ONLY. No buyer email, distributor request, purchase order or authorized quotation is sent by preview or approval.'};
}
export function validateManualBuyerSend(input,quote,lead){
 if(input.confirm!==true||input.acknowledgedManualSend!==true)bad('manual send confirmation');
 if(input.quoteId!==quote.id)throw new HttpError(409,'Quote approval changed. Refresh before recording the send.');
 if(input.fingerprint!==quote.fingerprint)throw new HttpError(409,'Quote body or prices changed. Review again before sending.');
 const recipient=text(input.recipient,'buyer recipient',254,true).toLowerCase();
 if(recipient!==lead.inquiry.email.toLowerCase())throw new HttpError(400,'This release can record sending only to the verified original business email on the inquiry.');
 const evidence=text(input.evidence,'manual send evidence',500,true);
 if(evidence.length<8)bad('manual sending evidence');
 return {recipient,evidence};
}
