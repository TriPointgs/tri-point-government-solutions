// Exact-commit opt-in. OAuth + one UAT product read only; no catalog/storage/order mutations.
import {pathToFileURL} from 'node:url';
import {createTdReadonly,TdReadError} from '../lib/tdsynnex-readonly.mjs';
export const UAT_TEST_PRODUCT=Object.freeze({sku:'7825493',part:'UNIVK-LAPTOP-LOCK'});
const TOKEN='https://sso.us.tdsynnex.com/oauth2/v1/token';
const PRICE='https://api-uat.us.tdsynnex.com/api/v1/webservice/json/GetPriceAvailability';
const OAUTH_ERRORS=new Set(['invalid_client','invalid_request','unsupported_grant_type','invalid_grant','unauthorized_client','invalid_scope','access_denied','server_error','temporarily_unavailable']);
async function rejection(response){
 const info={httpStatus:response.status,error:'unclassified'};
 try{if(!/application\/json/i.test(response.headers.get('content-type')||''))return info;const reader=response.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();return info;}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(OAUTH_ERRORS.has(data?.error))info.error=data.error;}catch{}
 return info;
}
const CODES=new Set(['oauth_unavailable','oauth_rejected','oauth_invalid','invalid_content_type','response_too_large','invalid_json','pricing_unavailable','supplier_rate_limit','pricing_http_error','account_mismatch','ValidateCustomerExists','ValidateVersion','Client.InvalidSynnexSKU','InvalidMfgPartNumber','business_error','invalid_response','unmatched_response']);
export const uatProbeEnabled=e=>e.VERCEL_ENV==='preview'&&e.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&/^[a-f0-9]{40}$/.test(e.VERCEL_GIT_COMMIT_SHA||'')&&e.TP_TD_UAT_READ_PROBE_COMMIT===e.VERCEL_GIT_COMMIT_SHA;
export async function verifyTdUat({env=process.env,fetcher=fetch,clock=()=>Date.now()}={}){
 if(!uatProbeEnabled(env))return {enabled:false,status:'skipped-not-exact-preview-commit'};
 const out={enabled:true,sourceCommit:env.VERCEL_GIT_COMMIT_SHA,checkedAt:new Date(clock()).toISOString(),environment:'uat',execution:'hosted-build-read-not-checkout',product:UAT_TEST_PRODUCT,oauthAuthenticated:false,requests:{oauth:0,price:0},status:'not-checked',orderCreated:false,paymentCreated:false,catalogUpdated:false,productionPriceVerified:false,publicLaunchReady:false};
 const required=['TP_TD_UAT_CLIENT_ID','TP_TD_UAT_CLIENT_SECRET','TP_TD_UAT_CUSTOMER_NO'];
 if(required.some(k=>typeof env[k]!=='string'||!env[k].trim())||!/^[1-9]\d{0,9}$/.test(env.TP_TD_UAT_CUSTOMER_NO)){out.status='missing-or-invalid-uat-configuration';return out;}
 // Local adapter mapping only. Existing production reader configuration is never changed.
 const config={TP_TD_CLIENT_ID:env.TP_TD_UAT_CLIENT_ID,TP_TD_CLIENT_SECRET:env.TP_TD_UAT_CLIENT_SECRET,TP_TD_CUSTOMER_NO:env.TP_TD_UAT_CUSTOMER_NO,TP_TD_API_ENVIRONMENT:'uat',TP_TD_READONLY_ENABLED:'true',TP_TD_PRODUCTION_READS_APPROVED:'false',TP_TD_ACCOUNT_CURRENCY:env.TP_TD_UAT_ACCOUNT_CURRENCY};
 out.credentialFormatting=Object.fromEntries(['TP_TD_UAT_CLIENT_ID','TP_TD_UAT_CLIENT_SECRET'].map((k,i)=>[i?'secret':'clientId',{surroundingWhitespace:env[k]!==env[k].trim(),quoteWrapped:/^[\"'].*[\"']$/s.test(env[k])}]));
 const restrictedFetch=async(url,options)=>{
  if(options?.method!=='POST'||options.redirect!=='error'||![TOKEN,PRICE].includes(url))throw Error('blocked-request');
  if(url===TOKEN){if(out.requests.oauth||out.requests.price)throw Error('duplicate-auth');out.requests.oauth++;}
  else {if(out.requests.oauth!==1||out.requests.price)throw Error('duplicate-price');const body=JSON.parse(options.body);if(body.version!=='2.8'||body.customerNo!==Number(env.TP_TD_UAT_CUSTOMER_NO)||body.skuList?.length!==1||body.skuList[0]?.synnexSKU!==UAT_TEST_PRODUCT.sku||body.skuList[0]?.priceType!=='REGULAR'||body.skuList[0]?.unitOfMeasure!=='EA')throw Error('unexpected-price-request');out.oauthAuthenticated=true;out.requests.price++;}
  const response=await fetcher(url,{...options,cache:'no-store'});
  if(url===TOKEN&&!response.ok)out.oauthRejection=await rejection(response);
  return response;
 };
 try{
  const rows=await createTdReadonly({env:config,fetcher:restrictedFetch,clock}).lookup([{sku:UAT_TEST_PRODUCT.sku}]),r=rows[0];
  if(rows.length!==1||!r?.identityMatched||r.sku!==UAT_TEST_PRODUCT.sku||r.mfgPart!==UAT_TEST_PRODUCT.part){out.status='product-identity-not-confirmed';return out;}
  const knownIssues=['inactive_or_unauthorized','pricing_context_mismatch','missing_or_invalid_price','warehouse_data_needs_review','unknown_total_quantity','warehouse_total_differs'];
  out.status='uat-product-response-verified';
  out.productChecks={identityMatched:true,active:r.status==='Active'&&!r.issues.includes('inactive_or_unauthorized'),regularUnitCostPresent:Number.isSafeInteger(r.costCents)&&r.costCents>0,quantityOneAvailable:Number.isSafeInteger(r.stockQuantity)&&r.stockQuantity>=1,stockKnown:Number.isSafeInteger(r.stockQuantity),parcelShippable:r.parcelShippable===true,endUserRequirement:r.endUserRequired===true?'required':r.endUserRequired===false?'not-required':'unknown',currencyConfirmed:r.currency==='USD',issues:r.issues.filter(x=>knownIssues.includes(x))};
 }catch(e){out.status='read-failed';out.code=e instanceof TdReadError&&CODES.has(e.code)?e.code:'unverified-error';}
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!uatProbeEnabled(process.env))console.log('TP_TD_UAT_READ_PROBE skipped: no exact-commit opt-in.');
 else try{console.log('TP_TD_UAT_READ_PROBE '+JSON.stringify(await verifyTdUat()));}catch{console.log('TP_TD_UAT_READ_PROBE unverified internal failure; no raw details emitted.');process.exitCode=1;}
}
