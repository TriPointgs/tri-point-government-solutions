import {HttpError} from './model.mjs';

export const EQUIPMENT_PRICE_TYPES=[
  'REGULAR','PROMOTION','EDUCATION','HEALTHCARE','FEDERALGOVERNMENT','STATEGOVERNMENT'
];
const ensure=(ok,field)=>{if(!ok)throw new HttpError(400,`Invalid ${field}.`);};
const own=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function str(value,field,max=220,required=false){
  ensure(value==null||typeof value==='string',field);
  const x=String(value??'').trim();
  ensure(x.length<=max&&!/[\x00-\x1f]/.test(x)&&(!required||x.length>0),field);
  return x;
}
function cents(value,field,{required=true,zero=false}={}){
  if(!required&&(value==null||value===''))return null;
  ensure(Number.isSafeInteger(value)&&value>=(zero?0:1)&&value<=100000000000,field);
  return value;
}
function count(value,field,max=100000){
  ensure(Number.isSafeInteger(value)&&value>=1&&value<=max,field);
  return value;
}
export function normalizeEquipmentProduct(input){
  ensure(own(input),'product');
  const sku=str(input.sku,'TD SYNNEX SKU',45,true);
  ensure(/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(sku),'TD SYNNEX SKU');
  const mfgPN=str(input.mfgPN,'manufacturer part number',130);
  const status=str(input.status??'Unknown','product status',60);
  ensure(['Active','Inactive','Discontinued','Not found','Not authorized','Not authorized to buy','Unknown'].includes(status),'product status');
  const priceType=str(input.priceType??'REGULAR','price type',30);
  ensure(EQUIPMENT_PRICE_TYPES.includes(priceType),'price type');
  const checkedAt=str(input.checkedAt,'verification timestamp',60);
  if(checkedAt)ensure(!Number.isNaN(Date.parse(checkedAt))&&/Z$/.test(checkedAt),'verification timestamp');
  return Object.freeze({
    supplier:'TD_SYNNEX',
    sku,mfgPN,
    manufacturer:str(input.manufacturer,'manufacturer',120),
    description:str(input.description,'description',400,true),
    category:str(input.category,'category',100),
    status,priceType,
    authorized:input.authorized===true,
    unitCostCents:cents(input.unitCostCents,'unit cost',{required:false}),
    stockQuantity:input.stockQuantity==null?null:(ensure(Number.isSafeInteger(input.stockQuantity)&&input.stockQuantity>=0&&input.stockQuantity<=10000000,'stock quantity'),input.stockQuantity),
    checkedAt:checkedAt||null
  });
}
export function equipmentReadiness(product,{now=Date.now(),maxAgeMs=24*60*60*1000,buyerPriceType='REGULAR',quantity=1}={}){
  const issues=[];
  if(product.status!=='Active')issues.push('Product is not confirmed active');
  if(product.authorized!==true)issues.push('Reseller authorization is not confirmed');
  if(product.unitCostCents==null)issues.push('Current supplier unit cost is missing');
  if(product.stockQuantity==null||product.stockQuantity<quantity)issues.push('Required inventory quantity is not confirmed');
  if(!product.checkedAt||!Number.isFinite(Date.parse(product.checkedAt))||Date.parse(product.checkedAt)>now+60000||now-Date.parse(product.checkedAt)>maxAgeMs)issues.push('Supplier data needs a fresh check');
  if(product.priceType!==buyerPriceType)issues.push('Buyer pricing eligibility requires review');
  return {ready:issues.length===0,issues};
}
// Money is integer cents. Freight and fees are included in the cost basis.
export function estimateEquipmentQuote(input){
  ensure(own(input),'quote');
  const quantity=count(input.quantity,'quantity');
  const unitCostCents=cents(input.unitCostCents,'unit cost');
  const freightCents=cents(input.freightCents??0,'freight',{zero:true});
  const feesCents=cents(input.feesCents??0,'fees',{zero:true});
  const markupBps=input.markupBps??1200;
  const minMarginBps=input.minMarginBps??0;
  const minimumProfitCents=cents(input.minimumProfitCents??0,'minimum profit',{zero:true});
  ensure(Number.isSafeInteger(markupBps)&&markupBps>=0&&markupBps<=50000,'markup');
  ensure(Number.isSafeInteger(minMarginBps)&&minMarginBps>=0&&minMarginBps<9000,'minimum margin');
  const cost=quantity*unitCostCents+freightCents+feesCents;
  ensure(Number.isSafeInteger(cost)&&cost<=100000000000,'landed cost');
  const byMarkup=Math.ceil(cost*(10000+markupBps)/10000);
  const byMargin=Math.ceil(cost*10000/(10000-minMarginBps));
  const minTotal=Math.max(byMarkup,byMargin,cost+minimumProfitCents);
  const unitSellCents=Math.ceil(minTotal/quantity);
  const sellTotalCents=unitSellCents*quantity;
  ensure(Number.isSafeInteger(sellTotalCents)&&sellTotalCents<=100000000000,'quoted total');
  const estimatedProfitCents=sellTotalCents-cost;
  return Object.freeze({
    quantity,unitCostCents,freightCents,feesCents,landedCostCents:cost,
    markupBps,minMarginBps,minimumProfitCents,
    unitSellCents,sellTotalCents,estimatedProfitCents,
    grossMarginBps:Math.floor(estimatedProfitCents*10000/sellTotalCents),
    taxNotIncluded:true,estimateOnly:true
  });
}
function norm(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
export function matchEquipmentProducts(request,products){
  ensure(own(request),'equipment requirements');
  ensure(Array.isArray(products)&&products.length<=1000,'catalog batch');
  const sku=norm(str(request.sku,'requested SKU',45));
  const mfgPN=norm(str(request.mfgPN,'requested manufacturer part number',130));
  ensure(sku||mfgPN,'requested SKU or manufacturer part number');
  const manufacturer=norm(str(request.manufacturer,'requested manufacturer',120));
  const quantity=count(request.quantity??1,'quantity');
  const matches=[];
  for(const item of products){
    const product=normalizeEquipmentProduct(item);
    const skuMatch=!!sku&&sku===norm(product.sku);
    const mfgMatch=!!mfgPN&&mfgPN===norm(product.mfgPN);
    if(!skuMatch&&!mfgMatch)continue;
    const manufacturerMismatch=!!manufacturer&&!!product.manufacturer&&manufacturer!==norm(product.manufacturer);
    const readiness=equipmentReadiness(product,{quantity,buyerPriceType:request.priceType||'REGULAR'});
    const issues=[...readiness.issues];
    if(manufacturerMismatch)issues.push('Manufacturer differs from requirement');
    if(!skuMatch)issues.push('Manufacturer part number match needs SKU confirmation');
    matches.push({
      sku:product.sku,mfgPN:product.mfgPN,manufacturer:product.manufacturer,
      description:product.description,matchType:skuMatch?'exact-sku':'exact-part-number',
      readyForManualQuoteReview:issues.length===0,issues
    });
  }
  return matches.sort((a,b)=>(a.matchType==='exact-sku'?0:1)-(b.matchType==='exact-sku'?0:1)).slice(0,50);
}
// Explicitly safe for public use; private cost, warehouse, authorization and stock not exposed.
export function publicEquipmentView(input){
  const p=normalizeEquipmentProduct(input);
  return {sku:p.sku,mfgPN:p.mfgPN,manufacturer:p.manufacturer,description:p.description,
    category:p.category,availability:'Contact Tri-Point to confirm',quoteRequired:true};
}
