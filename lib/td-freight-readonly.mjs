// TD GetFreightQuote 2.1 response validation. Pricing read only; no shipment/PO creation.
import {HttpError} from './model.mjs';
const bad=m=>{throw new HttpError(502,m);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function freightMoney(value){if(typeof value!=='number'&&typeof value!=='string')return null;const s=String(value).trim();if(!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(s))return null;const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));return Number.isSafeInteger(n)&&n<=1000000000?n:null;}
export function freightInput(input){
 if(!obj(input)||Object.keys(input).some(k=>!['zip','items'].includes(k))||!/^\d{5}$/.test(input.zip||''))throw new HttpError(400,'A five-digit delivery ZIP is required.');
 if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20)throw new HttpError(400,'Quote 1–20 cart items.');const seen=new Set();
 const items=input.items.map(x=>{if(!obj(x)||Object.keys(x).some(k=>!['sku','quantity'].includes(k))||typeof x.sku!=='string'||!(/^[1-9]\d{0,11}$/).test(x.sku)||seen.has(x.sku)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>9999)throw new HttpError(400,'Invalid freight item.');seen.add(x.sku);return {sku:x.sku,quantity:x.quantity};});return {zip:input.zip,items};
}
export function tdWeight(value){if(typeof value!=='string'&&typeof value!=='number')return null;const s=String(value).trim();if(!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,4})?$/.test(s)||Number(s)<=0)return null;return s;}
export function normalizeFreight(data,input,{environment,checkedAt,currencyConfirmed=false}={}){
 const requested=freightInput(input);if(!['uat','production'].includes(environment)||!Number.isFinite(Date.parse(checkedAt)))bad('Invalid freight response context.');if(!obj(data)||data.BizError||data.errorMessage||data.errorDetail)bad('TD could not confirm delivery charges.');
 const root=data.FreightQuoteResponse;if(!obj(root)||root.ErrorMessage||root.ErrorDetail)bad('TD did not return a usable delivery quote.');
 const zip=typeof root.ShipToZipCode==='number'?String(root.ShipToZipCode).padStart(5,'0'):String(root.ShipToZipCode||'');if(zip!==requested.zip)bad('TD delivery quote does not match the destination.');
 const shipments=Array.isArray(root.Shipment)?root.Shipment:[root];if(Array.isArray(root.Shipment)&&root.OtherCharge!==undefined&&shipments.some(s=>s?.OtherCharge!==undefined))bad('Delivery fees were returned at conflicting levels; confirmation is required.');if(!shipments.length||shipments.length>40)bad('Unexpected supplier shipment count.');
 const expected=new Map(requested.items.map((x,i)=>[x.sku,{...x,line:i+1}])),counts=new Map(),refs=new Set(),out=[];let freightCents=0,extras=0,extrasKnown=true;
 const charge=(where)=>{if(where===undefined||where===null){extrasKnown=false;return 0;}if(!obj(where))bad('Supplier fee data needs review.');let n=0;for(const k of ['MinOrderFee','CODFee']){const v=freightMoney(where[k]);if(v===null){extrasKnown=false;continue;}n+=v;}if(Object.keys(where).some(k=>!['MinOrderFee','CODFee'].includes(k)&&where[k]!==null&&where[k]!==0&&where[k]!=='0'))extrasKnown=false;return n;};
 for(const [si,s]of shipments.entries()){
  if(!obj(s)||s.ErrorMessage||s.ErrorDetail||!Array.isArray(s.Items)||s.Items.length>100)bad('A delivery shipment is incomplete.');
  if(s.Number!==undefined){if(!Number.isSafeInteger(s.Number)||s.Number<1||refs.has(s.Number))bad('Duplicate delivery shipment.');refs.add(s.Number);}
  const local=new Set();for(const x of s.Items){const sku=String(x?.SKU??''),e=expected.get(sku);if(!e||local.has(sku)||!Number.isSafeInteger(x.Quantity)||x.Quantity<1||x.Quantity>e.quantity)bad('Freight quote product or quantity mismatch.');local.add(sku);
   if(x.LineNumber!==undefined&&String(x.LineNumber)!==String(e.line))bad('Freight quote line mismatch.');counts.set(sku,(counts.get(sku)||0)+x.Quantity);}
  if(!Array.isArray(s.AvailableShipMethods)||s.AvailableShipMethods.length>100)bad('No usable delivery services returned.');
  const methods=s.AvailableShipMethods.filter(x=>obj(x)&&/^[A-Za-z0-9_-]{1,30}$/.test(x.Code||'')&&freightMoney(x.Freight)!==null).map(x=>({code:x.Code,amountCents:freightMoney(x.Freight)})).sort((a,b)=>a.amountCents-b.amountCents||a.code.localeCompare(b.code));if(!methods.length)bad('No valid delivery amount returned.');
  const chosen=methods[0];freightCents+=chosen.amountCents;
  // The supplied contract puts OtherCharge on the response/shipment, not a method.
  // An unexpected method-level fee cannot silently count as confirmed zero.
  if(s.AvailableShipMethods.some(x=>x?.Code===chosen.code&&x.OtherCharge!==undefined))extrasKnown=false;
  const hasTopCharges=Array.isArray(root.Shipment)&&root.OtherCharge!==undefined;
  extras+=s.OtherCharge!==undefined?charge(s.OtherCharge):hasTopCharges?0:charge(undefined);
  out.push({index:si+1,freightCents:chosen.amountCents,methodCode:chosen.code,reportedTotalWeight:tdWeight(s.TotalWeight),weightUnit:null,items:s.Items.map(x=>({sku:String(x.SKU),quantity:x.Quantity}))});
 }
 for(const [sku,e]of expected)if(counts.get(sku)!==e.quantity)bad('Freight quote does not cover the complete cart.');
 if(Array.isArray(root.Shipment)&&root.OtherCharge!==undefined)extras+=charge(root.OtherCharge);
 if(!Number.isSafeInteger(freightCents+extras)||freightCents+extras>1000000000)bad('Delivery quote amount exceeds bounds.');
 // FreeFreightThreshold is documented as always zero; NEVER use it as eligibility evidence.
 return {source:'tdsynnex-freightquote',environment,checkedAt,zip:requested.zip,currency:currencyConfirmed?'USD':null,freightCents,knownExtraChargesCents:extras,extraChargesComplete:extrasKnown,
  amountCents:freightCents+extras,shipments:out,shipmentCount:out.length,estimated:true,submittedOrder:false};
}
