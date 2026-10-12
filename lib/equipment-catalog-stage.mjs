import {createHash} from 'node:crypto';
import {HttpError} from './model.mjs';
import {normalizeEquipmentProduct} from './equipment-pricing.mjs';

/*
 * Internal synthetic feed contract, NOT TD SYNNEX's production flat-file layout.
 * Actual TD SYNNEX mappings require an account-provisioned sample and approved
 * spec validation. Never surface records from here in the public storefront.
 */
export const SYNTHETIC_CATALOG_FORMAT = 'TP_SYNTHETIC_CATALOG_CSV_V1';
export const SYNTHETIC_STOCK_FORMAT = 'TP_SYNTHETIC_HOURLY_STOCK_CSV_V1';
export const CATALOG_HEADERS = Object.freeze([
  'sku','mfgPN','manufacturer','description','category','status','priceType','unitCost'
]);
export const STOCK_HEADERS = Object.freeze(['sku','quantity','stockAt']);
export const MAX_FEED_BYTES=131072;
export const MAX_FEED_RECORDS=250;

function fail(message){throw new HttpError(400,message);}
function assert(ok,message){if(!ok)fail(message);}
function isoDate(input,label){
  assert(typeof input==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input),`Invalid ${label}: UTC ISO 8601 required.`);
  const d=new Date(input);
  assert(!Number.isNaN(d.getTime()) && d.toISOString().slice(0,19)===input.slice(0,19),`Invalid ${label}.`);
  return d.toISOString();
}
function id(value){
  assert(typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,44}$/.test(value.trim()),'Invalid synthetic SKU.');
  return value.trim();
}
function safeString(value,label,max=400){
  assert(typeof value==='string' && value.length<=max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value),`Invalid ${label}.`);
  return value.trim();
}
function parseMoney(value){
  if(value==='')return null;
  assert(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value),'Invalid unit cost; USD decimal expected.');
  const [whole,fraction='']=value.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  assert(Number.isSafeInteger(cents)&&cents>0&&cents<=100000000000,'Invalid unit cost.');
  return cents;
}
function parseCsv(source,headers){
  assert(typeof source==='string' && Buffer.byteLength(source,'utf8')<=MAX_FEED_BYTES,'Feed exceeds size limit.');
  assert(source.length>0,'Feed is empty.');
  const raw=source.charCodeAt(0)===0xfeff?source.slice(1):source;
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const append=()=>{assert(cell.length<=1000,'Field exceeds limit.');row.push(cell);cell='';closed=false;};
  const newline=()=>{
    append();
    if(row.length===1&&row[0]===''){row=[];return;}
    assert(row.length===headers.length,'Feed row has an unexpected number of columns.');
    rows.push(row);row=[];
    assert(rows.length<=MAX_FEED_RECORDS+1,'Feed exceeds row limit.');
  };
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(quoted){
      if(c==='"'){
        if(raw[i+1]==='"'){cell+='"';i++;}
        else{quoted=false;closed=true;}
      }else{cell+=c;}
    }else if(c==='"'){
      assert(cell===''&&!closed,'Invalid CSV quotation.');
      quoted=true;
    }else if(c===','){append();}
    else if(c==='\r'&&raw[i+1]==='\n'){}
    else if(c==='\n'){newline();}
    else{
      assert(!closed,'Invalid characters after quoted CSV field.');
      cell+=c;
    }
    assert(cell.length<=1000,'Field exceeds limit.');
  }
  assert(!quoted,'Unclosed CSV quotation.');
  if(cell.length||row.length||closed)newline();
  assert(rows.length>1,'Feed has no data records.');
  assert(rows[0].length===headers.length && rows[0].every((h,i)=>h===headers[i]),'Unknown feed columns or mapping version.');
  assert(rows.length-1<=MAX_FEED_RECORDS,'Feed exceeds row limit.');
  return rows.slice(1).map((values,i)=>Object.fromEntries(headers.map((h,j)=>[h,values[j]])));
}
function digest(source){return createHash('sha256').update(source,'utf8').digest('hex');}
function unique(values,label){assert(new Set(values).size===values.length,`Duplicate ${label} records detected.`);}
function countByStatus(records){
  return Object.fromEntries([...new Set(records.map(r=>r.status))].sort().map(status=>[status,records.filter(r=>r.status===status).length]));
}

export function stageSyntheticCatalog({format,csv,receivedAt}){
  assert(format===SYNTHETIC_CATALOG_FORMAT,'Unsupported catalog mapping; only synthetic fixtures allowed.');
  const timestamp=isoDate(receivedAt,'catalog receipt timestamp');
  const rows=parseCsv(csv,CATALOG_HEADERS);
  const records=rows.map(row=>{
    const sku=id(row.sku);
    const normalized=normalizeEquipmentProduct({
      sku, mfgPN:safeString(row.mfgPN,'part number',130),
      manufacturer:safeString(row.manufacturer,'manufacturer',120),
      description:safeString(row.description,'description',400),
      category:safeString(row.category,'category',100),
      status:safeString(row.status,'status',60),
      priceType:safeString(row.priceType,'price type',30),
      unitCostCents:parseMoney(row.unitCost),
      stockQuantity:null,checkedAt:null,authorized:false
    });
    return {...normalized,stockAt:null,source:'SYNTHETIC_ONLY'};
  });
  unique(records.map(r=>r.sku+'|'+r.priceType),'SKU/price type');
  return {
    source:'SYNTHETIC_ONLY',format,receivedAt:timestamp,
    digest:digest(csv),records,
    summary:{rows:records.length,uniqueSkus:new Set(records.map(r=>r.sku)).size,
      unpriced:records.filter(r=>r.unitCostCents==null).length,
      unapproved:records.length,stockUnknown:records.length,
      statuses:countByStatus(records),previewOnly:true,published:false,persisted:false}
  };
}

export function reconcileSyntheticStock(catalog,{format,csv,mode='full'}){
  assert(catalog && catalog.source==='SYNTHETIC_ONLY' && Array.isArray(catalog.records),'Synthetic catalog stage required.');
  assert(format===SYNTHETIC_STOCK_FORMAT,'Unsupported stock mapping; only synthetic fixtures allowed.');
  assert(['full','delta'].includes(mode),'Unknown stock refresh mode.');
  const stock=parseCsv(csv,STOCK_HEADERS).map(row=>{
    const sku=id(row.sku);
    assert(/^(?:0|[1-9]\d{0,7})$/.test(row.quantity),'Invalid whole-number inventory quantity.');
    const quantity=Number(row.quantity);
    assert(Number.isSafeInteger(quantity)&&quantity<=10000000,'Invalid stock quantity.');
    return {sku,quantity,stockAt:isoDate(row.stockAt,'stock timestamp')};
  });
  unique(stock.map(r=>r.sku),'stock SKU');
  const skus=new Set(catalog.records.map(r=>r.sku));
  assert(stock.every(r=>skus.has(r.sku)),'Stock feed contains a SKU absent from the staged catalog.');
  if(mode==='full')assert(stock.length===skus.size,'Full stock feed must cover every catalog SKU; use delta for partial updates.');
  const bySku=new Map(stock.map(r=>[r.sku,r]));
  const changed=[];
  const next=catalog.records.map(original=>{
    const update=bySku.get(original.sku);
    if(!update)return {...original};
    const prevAt=original.stockAt?Date.parse(original.stockAt):null;
    if(prevAt!==null){
      const nowAt=Date.parse(update.stockAt);
      assert(nowAt>=prevAt,`Out-of-order stock timestamp for SKU ${original.sku}.`);
      assert(nowAt!==prevAt||original.stockQuantity===update.quantity,
        `Conflicting stock revision for SKU ${original.sku}.`);
    }
    if(original.stockQuantity!==update.quantity){
      if(!changed.some(r=>r.sku===original.sku)){
        changed.push({sku:original.sku,from:original.stockQuantity,to:update.quantity});
      }
    }
    return {...original,stockQuantity:update.quantity,stockAt:update.stockAt,
      // Stock updates never establish wholesale price validity or resale authorization.
      checkedAt:null,authorized:false};
  });
  return {
    ...catalog,records:next,
    stockDigest:digest(csv),
    summary:{
      ...catalog.summary,
      stockUnknown:next.filter(r=>r.stockQuantity==null).length,
      zeroStock:next.filter(r=>r.stockQuantity===0).length,
      stockRecords:stock.length,
      stockChanges:changed.slice(0,50),
      stockChangeCount:changed.length,
      previewOnly:true,published:false,persisted:false
    }
  };
}

export function syntheticImportReport({catalogCsv,stockCsv,receivedAt,mode='full'}){
  const catalog=stageSyntheticCatalog({
    format:SYNTHETIC_CATALOG_FORMAT,csv:catalogCsv,receivedAt
  });
  const next=stockCsv?reconcileSyntheticStock(catalog,{
    format:SYNTHETIC_STOCK_FORMAT,csv:stockCsv,mode
  }):catalog;
  return {source:next.source,catalogDigest:next.digest,stockDigest:next.stockDigest??null,
    summary:next.summary,enabledForWebsite:false,supplierApiCalled:false,
    orderSubmissionEnabled:false,safeForCustomerQuote:false};
}
