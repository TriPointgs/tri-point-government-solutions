import {orderSelector,orderStatusPath,normalizeOrderStatus} from './td-order-status.mjs';
import {freightInput,normalizeFreight,tdWeight} from './td-freight-readonly.mjs';
// Server-only TD SYNNEX US adapter. The only supplier operation implemented is
// Price/freight reads and separately gated GetOrderStatus. No order submission, payment or email operation exists here.
import {HttpError} from './model.mjs';

const TOKEN_URL = 'https://sso.us.tdsynnex.com/oauth2/v1/token';
const BASES = Object.freeze({uat:'https://api-uat.us.tdsynnex.com',production:'https://api.us.tdsynnex.com'});
const PRICE_PATH = '/api/v1/webservice/json/GetPriceAvailability';
const FREIGHT_PATH = '/api/v1/webservice/json/GetFreightQuote';
const BUSINESS_CODES = new Set(['ValidateCustomerExists','ValidateVersion','Client.InvalidSynnexSKU','InvalidMfgPartNumber']);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const clean = (x,max=160) => typeof x === 'string' ? x.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max) : '';
export class TdReadError extends HttpError {
  constructor(status,code,message) { super(status,message); this.name='TdReadError'; this.code=code; }
}
const error = (code,message,status=502) => { throw new TdReadError(status,code,message); };
export function tdConfiguration(env=process.env) {
  const environment=env.TP_TD_API_ENVIRONMENT || 'uat';
  const missing=[];
  for(const key of ['TP_TD_CLIENT_ID','TP_TD_CLIENT_SECRET','TP_TD_CUSTOMER_NO']) if(!env[key]) missing.push(key);
  const customer = String(env.TP_TD_CUSTOMER_NO||'');
  const validCustomer=/^[1-9]\d{0,9}$/.test(customer);
  const selected=Object.hasOwn(BASES,environment);
  const enabled=env.TP_TD_READONLY_ENABLED==='true' && selected && !missing.length && validCustomer &&
    (environment!=='production'||env.TP_TD_PRODUCTION_READS_APPROVED==='true');
  return {
    enabled,environment:selected?environment:'invalid',missing,
    currencyConfirmed:env.TP_TD_ACCOUNT_CURRENCY==='USD',
    productionReadsApproved:env.TP_TD_PRODUCTION_READS_APPROVED==='true',
    // Configuration metadata never contains client ID/secret, access token or account number.
    readOnly:true,contractVersion:'2.8',maximumBatch:100
  };
}
export function tdSelector(input) {
  if(!plain(input)||Object.keys(input).some(k=>!['sku','mfgPart'].includes(k))) error('invalid_selector','Use a TD SKU or exact manufacturer part number.',400);
  if((input.sku!==undefined)===(input.mfgPart!==undefined)) error('invalid_selector','Provide exactly one product identifier.',400);
  if(input.sku!==undefined){const sku=String(input.sku);if(!/^[1-9]\d{0,11}$/.test(sku)) error('invalid_sku','Invalid TD SYNNEX SKU.',400);return {sku};}
  if(typeof input.mfgPart!=='string'||!input.mfgPart.trim()||input.mfgPart.length>100||/[\x00-\x1f\x7f]/.test(input.mfgPart)) error('invalid_part','Invalid manufacturer part number.',400);
  return {mfgPart:input.mfgPart.trim().toUpperCase()};
}
export function tdAmountCents(value) {
  if(typeof value!=='string'&&typeof value!=='number') return null;
  const text=String(value).trim();
  if(!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(text)) return null;
  const [units,fraction='']=text.split('.');const cents=Number(units)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(cents)&&cents>0&&cents<=1000000000?cents:null;
}
const qty=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000000?value:null;
const flag=value=>value==='Y'?true:value==='N'?false:null;
const inactive=status=>status!=='Active';
function unavailable(selector,code,meta) {
  return {selector,...meta,sku:selector.sku||null,mfgPart:selector.mfgPart||'',status:'Unknown',
    costCents:null,msrpCents:null,stockQuantity:null,reportedTotalQuantity:null,warehouseQuantity:null,
    priceType:null,endUserRequired:null,parcelShippable:null,warehouses:[],issues:[code],identityMatched:false};
}
export function normalizeTdResponse(data,selectors,{environment,checkedAt,currencyConfirmed=false}={}) {
  if(!['uat','production'].includes(environment)||!Number.isFinite(Date.parse(checkedAt))) error('invalid_context','Invalid supplier response context.');
  if(!plain(data)) error('invalid_response','TD SYNNEX returned an invalid response.');
  if(data.errorMessage||data.errorDetail) {
    const candidate=clean(data.errorMessage,80);
    const code=BUSINESS_CODES.has(candidate)?candidate:'business_error';
    // The raw detail can echo account/credential data. Do not return or persist it.
    error(code,'TD SYNNEX returned a business error ('+code+'). Product pricing was not verified.');
  }
  if(!Array.isArray(data.PriceAvailabilityList)||data.PriceAvailabilityList.length>1000) error('invalid_response','TD SYNNEX did not return a valid product list.');
  const meta={source:'tdsynnex-priceavailability',environment,checkedAt,currency:currencyConfirmed?'USD':null,
    currencyEvidence:currencyConfirmed?'operator-confirmed-account-currency':'unconfirmed',reservedInventoryRequested:false};
  const groups=new Map();
  for(const row of data.PriceAvailabilityList) {
    if(!plain(row)||!Number.isSafeInteger(row.lineNumber)||row.lineNumber<1||row.lineNumber>selectors.length) error('unmatched_response','TD SYNNEX returned a line that cannot be matched to this request.');
    const arr=groups.get(row.lineNumber)||[];arr.push(row);groups.set(row.lineNumber,arr);
  }
  return selectors.map((selector,index)=>{
    const rows=groups.get(index+1)||[];
    if(!rows.length) return unavailable(selector,'missing_response_line',meta);
    // Part-number searches can expand to multiple SKUs. Never choose a price by position.
    if(rows.length!==1) return {...unavailable(selector,'ambiguous_product_match',meta),candidateSkus:[...new Set(rows.map(r=>String(r.synnexSKU)).filter(s=>/^[1-9]\d{0,11}$/.test(s)))].slice(0,100)};
    const row=rows[0],sku=String(row.synnexSKU??''),mfgPart=clean(row.mfgPN,110).toUpperCase();
    if(!/^[1-9]\d{0,11}$/.test(sku)||(selector.sku&&sku!==selector.sku)||(selector.mfgPart&&mfgPart!==selector.mfgPart)) return unavailable(selector,'product_identity_mismatch',meta);
    const status=clean(row.status,80),globalStatus=clean(row.GlobalProductStatusCode,100),issues=[];
    const active=!inactive(status)&&!/(?:not authorized|discontinued|inactive|not found)/i.test(globalStatus);
    if(!active)issues.push('inactive_or_unauthorized');
    const priceType=clean(row.priceType,40),cost=tdAmountCents(row.price);
    if(priceType!=='REGULAR')issues.push('pricing_context_mismatch');
    if(cost===null)issues.push('missing_or_invalid_price');
    const total=qty(row.totalQuantity),rawWarehouses=row.AvailabilityByWarehouse;
    const warehouses=[],ids=new Set();let warehouseQuantity=null,badWarehouse=false;
    if(Array.isArray(rawWarehouses)&&rawWarehouses.length<=100) {
      let sum=0;
      for(const w of rawWarehouses) {
        const number=w?.warehouseInfo?.number,q=qty(w?.qty);
        if(!Number.isSafeInteger(number)||number<0||number>9999||q===null||ids.has(number)){badWarehouse=true;continue;}
        ids.add(number);if(number===0)continue; // Reserved stock is not a sellable pool.
        sum+=q;warehouses.push({number,quantity:q,city:clean(w.warehouseInfo?.city,80)});
      }
      if(!badWarehouse&&rawWarehouses.length>0&&Number.isSafeInteger(sum))warehouseQuantity=sum;
    } else if(rawWarehouses!==null&&rawWarehouses!==undefined)badWarehouse=true;
    if(badWarehouse)issues.push('warehouse_data_needs_review');
    if(total===null)issues.push('unknown_total_quantity');
    if(warehouseQuantity!==null&&total!==null&&warehouseQuantity!==total)issues.push('warehouse_total_differs');
    // Use the smaller reported non-reserved pool, never add total and warehouse counts.
    const stockQuantity=active&&!badWarehouse&&total!==null?(warehouseQuantity!==null?Math.min(total,warehouseQuantity):total):null;
    return {selector,...meta,sku,mfgPart,status:status||'Unknown',globalStatus,
      description:clean(row.description,500),identityMatched:true,
      priceType:priceType||null,costCents:active&&priceType==='REGULAR'?cost:null,
      msrpCents:active?tdAmountCents(row.msrp):null,reportedTotalQuantity:active?total:null,
      warehouseQuantity:active?warehouseQuantity:null,stockQuantity,warehouses:active?warehouses:[],
      endUserRequired:flag(row.EURequired),parcelShippable:flag(row.parcelShippable),reportedUnitWeight:active?tdWeight(row.weight):null,weightUnit:null,issues};
  });
}
async function jsonLimited(response,maxBytes) {
  if(!/json/i.test(response.headers?.get?.('content-type')||'')) error('invalid_content_type','Supplier returned a non-JSON response.');
  if(Number(response.headers?.get?.('content-length')||0)>maxBytes)error('response_too_large','Supplier response exceeded its size limit.');
  let text='';
  if(response.body?.getReader){
    const reader=response.body.getReader();let total=0;const chunks=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();error('response_too_large','Supplier response exceeded its size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
    text=Buffer.concat(chunks.map(x=>Buffer.from(x))).toString('utf8');
  }else{text=await response.text();if(Buffer.byteLength(text)>maxBytes)error('response_too_large','Supplier response exceeded its size limit.');}
  try{return JSON.parse(text);}catch{error('invalid_json','Supplier returned invalid JSON.');}
}
export function createTdReadonly({env=process.env,fetcher=fetch,clock=()=>Date.now()}={}) {
  // Pin credentials and account scope for this adapter instance; a new deployment
  // or adapter instance is required after configuration changes.
  env=Object.freeze(Object.fromEntries(['TP_TD_CLIENT_ID','TP_TD_CLIENT_SECRET','TP_TD_CUSTOMER_NO','TP_TD_API_ENVIRONMENT','TP_TD_READONLY_ENABLED','TP_TD_PRODUCTION_READS_APPROVED','TP_TD_ACCOUNT_CURRENCY','TP_TD_ORDER_STATUS_ENABLED'].map(k=>[k,env[k]])));
  let cached=null,pending=null;
  const configuration=()=>tdConfiguration(env);
  async function token() {
    if(cached&&cached.expiresAt>clock()+60000)return cached.value;
    if(pending)return pending;
    pending=(async()=>{
      let r;try{r=await fetcher(TOKEN_URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.TP_TD_CLIENT_ID,client_secret:env.TP_TD_CLIENT_SECRET}),signal:AbortSignal.timeout(8000)});}catch{error('oauth_unavailable','TD SYNNEX authentication could not be reached.');}
      if(!r.ok)error('oauth_rejected','TD SYNNEX did not accept the configured OAuth credentials.');
      const data=await jsonLimited(r,16000);
      if(typeof data.access_token!=='string'||data.access_token.length<16||data.access_token.length>12000||/[\r\n]/.test(data.access_token)||!Number.isSafeInteger(data.expires_in)||data.expires_in<120||data.expires_in>86400||String(data.token_type||'Bearer').toLowerCase()!=='bearer')error('oauth_invalid','TD SYNNEX returned an unusable authentication response.');
      cached={value:data.access_token,expiresAt:clock()+data.expires_in*1000};return cached.value;
    })();
    try{return await pending;}finally{pending=null;}
  }
  return {
    configuration,
    orderStatusConfiguration(){const cfg=configuration();return {enabled:cfg.enabled&&env.TP_TD_ORDER_STATUS_ENABLED!=='false',environment:cfg.environment,existingReadApproval:cfg.enabled,readOnly:true,operation:'GetOrderStatus'};},
    async orderStatus(input){
      const selector=orderSelector(input),cfg=configuration();
      if(!cfg.enabled||env.TP_TD_ORDER_STATUS_ENABLED==='false')error('order_reads_disabled','The existing read-only supplier connection is disabled or missing its required approval.',503);
      const bearer=await token();let response;
      try{response=await fetcher(BASES[cfg.environment]+orderStatusPath(selector),{method:'GET',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},signal:AbortSignal.timeout(12000)});}catch{error('order_status_unavailable','Supplier order status is temporarily unavailable. No order was submitted.');}
      if(response.status===401)cached=null;
      if(response.status===429)error('supplier_rate_limit','Supplier order-status request limit reached. Try again later.',429);
      if(!response.ok)error('order_status_http_error','The supplier did not accept the read-only status request.');
      return normalizeOrderStatus(await jsonLimited(response,2000000),selector,{environment:cfg.environment,checkedAt:new Date(clock()).toISOString()});
    },
    async freight(input){
      const cfg=configuration();if(!cfg.enabled)error('td_not_configured','Supplier connection is not enabled.',503);
      const query=freightInput(input),bearer=await token();
      const body={FreightQuoteRequest:{Version:'2.1',CustomerNumber:Number(env.TP_TD_CUSTOMER_NO),ShipToZipCode:query.zip,Items:query.items.map((x,i)=>({LineNumber:String(i+1),SKU:x.sku,Quantity:x.quantity}))}};
      let response;try{response=await fetcher(BASES[cfg.environment]+FREIGHT_PATH,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}catch{error('freight_unavailable','Delivery estimate is temporarily unavailable. No order was sent.');}
      if(response.status===401)cached=null;
      if(response.status===429)error('supplier_rate_limit','Supplier delivery lookup rate limit reached.',429);
      if(!response.ok)error('freight_http_error','Supplier could not confirm a delivery estimate.');
      const data=await jsonLimited(response,700000);
      const account=data?.FreightQuoteResponse?.CustomerNumber;if(account!==null&&account!==undefined&&String(account)!==String(Number(env.TP_TD_CUSTOMER_NO)))error('account_mismatch','The delivery quote belongs to a different account.');
      return normalizeFreight(data,query,{environment:cfg.environment,checkedAt:new Date(clock()).toISOString(),currencyConfirmed:cfg.currencyConfirmed});
    },
    async lookup(input) {
      const cfg=configuration();if(!cfg.enabled)error('td_not_configured','TD SYNNEX read-only access is not enabled for this environment. Check the connection panel.',503);
      if(!Array.isArray(input)||!input.length||input.length>100)error('invalid_batch','Select between 1 and 100 products.',400);
      const selectors=input.map(tdSelector);const keys=selectors.map(x=>JSON.stringify(x));if(new Set(keys).size!==keys.length)error('duplicate_selector','Duplicate product identifiers are not allowed.',400);
      const bearer=await token(),body={version:'2.8',customerNo:Number(env.TP_TD_CUSTOMER_NO),skuList:selectors.map((s,i)=>({...(s.sku?{synnexSKU:s.sku}:{mfgPN:s.mfgPart}),lineNumber:i+1,priceType:'REGULAR',unitOfMeasure:'EA'}))};
      let r;try{r=await fetcher(BASES[cfg.environment]+PRICE_PATH,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});}catch{error('pricing_unavailable','TD SYNNEX pricing did not respond. No order was sent.');}
      if(r.status===401)cached=null;
      if(r.status===429)error('supplier_rate_limit','TD SYNNEX rate limit reached. Wait before another lookup.',429);
      if(!r.ok)error('pricing_http_error','TD SYNNEX rejected the read-only product lookup.');
      const data=await jsonLimited(r,1000000);
      if(data.customerNo!==null&&data.customerNo!==undefined&&String(data.customerNo)!==String(Number(env.TP_TD_CUSTOMER_NO)))error('account_mismatch','The supplier response belongs to a different account.');
      return normalizeTdResponse(data,selectors,{environment:cfg.environment,checkedAt:new Date(clock()).toISOString(),currencyConfirmed:cfg.currencyConfirmed});
    }
  };
}
