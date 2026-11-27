// Private TEST-only Stripe Tax transaction reconciliation.
// This module is intentionally standalone: callers must invoke it from trusted
// capture/refund reconciliation paths. It never creates a payment or refund.
import Stripe from 'stripe';
import {createHash,randomUUID} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {readVersionedPrivateBlob} from './blob-versioned-read.mjs';
import {HttpError} from './model.mjs';
import {createFinalOrderStore} from './final-order-store.mjs';
import {createPaymentVerificationStore,paymentOrderKey} from './payment-verification-store.mjs';
import {bindingForFinalOrder,validateBinding} from './payment-release-policy.mjs';
import {stripeTestConfiguration,stripeMarketplaceConfiguration} from './stripe-payment-verifier.mjs';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const cents=value=>Number.isSafeInteger(value)&&value>=0&&value<=99999999;
const fail=(message,status=409)=>{throw new HttpError(status,message);};
const hashBinding=b=>sha({...b,createdAt:null});
const transactionId=value=>typeof value==='string'&&/^tax_[A-Za-z0-9]{4,150}$/.test(value);
const refundId=value=>typeof value==='string'&&/^re_[A-Za-z0-9]{4,150}$/.test(value);
const states=new Set(['sale-pending','sale-uncertain','sale-posted','sale-needs-review','reversal-pending','reversal-uncertain','reversed','reversal-needs-review']);
const validTaxBasis=(basis,order)=>{
 if(!basis||!/^[a-f0-9]{64}$/.test(basis.requestDigest||'')||!Array.isArray(basis.lines)||!Object.hasOwn(basis,'shippingCost')||basis.lines.length!==order.lines?.length||!cents(order.subtotalCents)||!cents(order.shippingCents))return false;
 let amount=0;const seen=new Set();
 for(const line of basis.lines){const source=order.lines.find(x=>x.sku===line?.reference);if(!source||seen.has(line.reference)||!cents(line.amount)||line.quantity!==source.quantity||line.tax_behavior!=='exclusive'||!/^txcd_\d{8}$/.test(line.tax_code||''))return false;seen.add(line.reference);amount+=line.amount;}
 if(!Number.isSafeInteger(amount))return false;
 if(basis.shippingCost==null)return amount===order.subtotalCents+order.shippingCents;
 return !!basis.shippingCost&&basis.shippingCost.amount===order.shippingCents&&cents(basis.shippingCost.amount)&&amount===order.subtotalCents;
};

export function orderTaxLedgerKey(accountId,orderId){
 if(!/^acct_[A-Za-z0-9]{4,100}$/.test(accountId||'')||!uuid(orderId))fail('Invalid tax ledger reference.',400);
 return sha(['order-tax-ledger-v1',accountId,orderId]);
}

export function createOrderTaxLedgerStore({env=process.env,blob={get,put}}={}){
 const environment=Object.freeze({...env}),account=environment.TP_STRIPE_TEST_ACCOUNT_ID;
 const readPrefix=()=>{
  if(environment.VERCEL_ENV!=='preview'||environment.VERCEL_GIT_COMMIT_REF!=='feature/td-product-controls'||!/^acct_[A-Za-z0-9]{4,100}$/.test(account||'')||environment.TP_STRIPE_MARKETPLACE_TEST_ACCOUNT_ID!==account||!stripeTestConfiguration(environment).configured||!stripeMarketplaceConfiguration(environment).configured)fail('Private test tax ledger is unavailable.',503);
  return sha(['test-order-tax-ledger',account]);
 };
 const writePrefix=()=>{const root=readPrefix();if(environment.TP_STRIPE_TEST_TAX_LEDGER_ENABLED!=='true')fail('Private test tax ledger writes are disabled.',503);return root;};
 const path=key=>{if(!/^[a-f0-9]{64}$/.test(key||''))fail('Invalid tax ledger key.',400);return 'preview/order-tax-ledger/v1/'+readPrefix()+'/'+key+'.json';};
 const validate=(r,key)=>{
  if(!r||r.schemaVersion!==1||r.kind!=='order-tax-ledger'||r.mode!=='test'||r.key!==key||!uuid(r.orderId)||r.accountId!==account||orderTaxLedgerKey(account,r.orderId)!==key||!Number.isSafeInteger(r.revision)||r.revision<1||!states.has(r.state)||!/^taxcalc_[A-Za-z0-9]{4,160}$/.test(r.calculationId||'')||!/^tp_test_sale_[0-9a-f-]{36}$/.test(r.sale?.reference||'')||typeof r.sale?.idempotencyKey!=='string'||r.sale.idempotencyKey.length>255)
   fail('Private tax ledger record is invalid.',503);
  if(r.sale.state==='posted'&&!transactionId(r.sale.transactionId))fail('Saved tax transaction needs reconciliation.',503);
  if(r.reversal&&(!refundId(r.reversal.refundId)||typeof r.reversal.reference!=='string'||typeof r.reversal.idempotencyKey!=='string'))fail('Saved tax reversal needs reconciliation.',503);
  return r;
 };
 return {
  async read(key){readPrefix();let result;try{result=await readVersionedPrivateBlob(blob,path(key));}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}if(!result)return null;if(!result.blob?.etag||!result.stream)fail('Tax ledger version is unavailable.',503);
   const reader=result.stream.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>50000){await reader.cancel();fail('Tax ledger record is too large.',503);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
   let record;try{record=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Tax ledger record is unreadable.',503);}return {record:validate(record,key),etag:result.blob.etag};
  },
  async save(key,record,etag){writePrefix();validate(record,key);const json=JSON.stringify(record);if(Buffer.byteLength(json)>50000)fail('Tax ledger record is too large.',503);await blob.put(path(key),json,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false})});}
 };
}

export function memoryOrderTaxLedgerStore(){const rows=new Map();let sequence=0;return {async read(key){return rows.has(key)?structuredClone(rows.get(key)):null;},async save(key,record,etag){if((rows.get(key)?.etag||null)!==etag)throw Error('etag_conflict');rows.set(key,{record:structuredClone(record),etag:String(++sequence)});}};}

/**
 * `refundReader` is a trusted server-only adapter, never request input. It must
 * freshly read the existing full-refund record from Stripe and return the exact
 * successful refund identity, amount, currency, PaymentIntent, order and checkedAt.
 * No refund or tax mutation is performed by that callback.
 */
export function createOrderTaxLedger({env=process.env,orders=createFinalOrderStore({env}),payments=createPaymentVerificationStore({env}),store=createOrderTaxLedgerStore({env}),client=null,refundReader=null,clock=()=>Date.now()}={}){
 const environment=Object.freeze({...env}),accountId=environment.TP_STRIPE_TEST_ACCOUNT_ID;let sdk=client;
 const readable=()=>environment.VERCEL_ENV==='preview'&&environment.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&stripeTestConfiguration(environment).configured&&stripeMarketplaceConfiguration(environment).configured;
 const readGuard=()=>{if(!readable())fail('Private test tax ledger is unavailable.',503);};
 const guard=()=>{readGuard();if(environment.TP_STRIPE_TEST_TAX_LEDGER_ENABLED!=='true')fail('Private test tax ledger writes are disabled.',503);};
 const provider=()=>sdk||(sdk=new Stripe(environment.TP_STRIPE_TEST_SECRET_KEY,{maxNetworkRetries:0,timeout:10000}));
 async function orderAndBinding(orderId){
  if(!uuid(orderId))fail('Invalid finalized order identifier.',400);const row=await orders.read(orderId),record=row?.record,o=record?.order;
  if(!record||record.phase!=='finalized'||record.mode!=='test'||o?.id!==orderId||o.kind!=='payable-order'||o.mode!=='test'||o.taxStatus!=='calculated'||!/^taxcalc_[A-Za-z0-9]{4,160}$/.test(record.taxCalculationId||'')||!/^[a-f0-9]{64}$/.test(o.taxEvidence||'')||!cents(o.taxCents)||!cents(o.totalCents)||!cents(o.subtotalCents)||!cents(o.shippingCents)||o.totalCents!==o.subtotalCents+o.shippingCents+o.taxCents||!validTaxBasis(record.taxLedgerBasis,o))fail('A finalized, calculated-tax order is required.',409);
  const link=await payments.read(paymentOrderKey(accountId,orderId));if(link?.record?.kind!=='order-link')fail('No exact payment binding exists for this order.',409);
  const binding=validateBinding(link.record.binding);if(binding.accountId!==accountId||binding.orderId!==orderId)fail('Payment binding does not match the test merchant and order.',409);
  const expected=bindingForFinalOrder(o,{paymentId:binding.paymentId,accountId,now:Date.parse(binding.createdAt)});if(hashBinding(expected)!==hashBinding(binding))fail('Payment binding does not match the immutable tax order.',409);
  return {record,order:o,binding};
 }
 async function captured(order,binding){
  let merchant,pi;try{merchant=await provider().accounts.retrieve();pi=await provider().paymentIntents.retrieve(binding.paymentId,{expand:['latest_charge','latest_charge.refunds']});}catch{fail('Captured payment evidence is unavailable; tax reconciliation remains open.',503);}
  const charge=pi?.latest_charge;
  if(merchant?.id!==accountId||pi?.object!=='payment_intent'||pi.id!==binding.paymentId||pi.livemode!==false||pi.status!=='succeeded'||pi.amount!==binding.amountCents||pi.amount_received!==binding.amountCents||pi.currency!=='usd'||pi.amount_capturable!==0||pi.on_behalf_of!=null||pi.transfer_data!=null||pi.metadata?.tp_order_id!==order.id||pi.metadata?.tp_order_version!==String(binding.orderVersion)||pi.metadata?.tp_quote_digest!==binding.quoteDigest||charge?.object!=='charge'||!/^ch_[A-Za-z0-9]{4,150}$/.test(charge.id||'')||charge.livemode!==false||charge.payment_intent!==binding.paymentId||charge.status!=='succeeded'||charge.paid!==true||charge.captured!==true||charge.amount!==binding.amountCents||charge.amount_captured!==binding.amountCents||charge.currency!=='usd'||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0||charge.amount_refunded>binding.amountCents)
   fail('Exact captured-payment evidence does not match the saved tax order.',409);
  return {paymentId:binding.paymentId,chargeId:charge.id,amountCents:binding.amountCents,checkedAt:new Date(clock()).toISOString()};
 }
 function baseRecord(order,record,key,binding){
  const reference='tp_test_sale_'+order.id;
  return {schemaVersion:1,kind:'order-tax-ledger',mode:'test',key,orderId:order.id,accountId,revision:1,state:'sale-pending',operation:randomUUID(),seal:sha([record.id,record.completedAt,record.order,record.taxCalculationId,record.taxLedgerBasis]),calculationId:record.taxCalculationId,
   sale:{reference,idempotencyKey:'tp-tax-sale-'+sha([accountId,order.id,record.taxCalculationId]),paymentId:binding.paymentId,quoteDigest:binding.quoteDigest,state:'pending',attemptedAt:new Date(clock()).toISOString(),transactionId:null},reversal:null};
 }
 async function persist(key,next,etag){try{await store.save(key,next,etag);}catch{const fresh=await store.read(key);if(fresh&&fresh.record.revision===next.revision&&fresh.record.state===next.state&&fresh.record.operation===next.operation)return fresh;fail('Tax ledger write is uncertain. Reconcile this same order; do not start another operation.',503);}const saved=await store.read(key);if(!saved||saved.record.operation!==next.operation||saved.record.revision!==next.revision)fail('Tax ledger write could not be read back.',503);return saved;}
 function matchesTransaction(tx,expected){
  if(tx?.object!=='tax.transaction'||!transactionId(tx.id)||tx.livemode!==false||tx.type!=='transaction'||tx.currency!=='usd'||tx.reference!==expected.reference||tx.metadata?.tp_order_id!==expected.orderId||tx.metadata?.tp_tax_calculation_id!==expected.calculationId||tx.metadata?.tp_payment_intent_id!==expected.paymentId||!tx.line_items||tx.line_items.object!=='list'||!Array.isArray(tx.line_items.data)||!tx.line_items.data.length||tx.line_items.has_more!==false||tx.reversal!=null)return false;
  if(tx.line_items.data.length!==expected.lines.length||(expected.shippingCost==null)!==(tx.shipping_cost==null))return false;
  const seen=new Set();let lineAmount=0,tax=0;
  for(const line of tx.line_items.data){const item=expected.lines.find(x=>x.reference===line?.reference);if(!item||seen.has(line.reference)||line.object!=='tax.transaction_line_item'||line.type!=='transaction'||line.livemode!==false||line.tax_behavior!==item.tax_behavior||!cents(line.amount)||!cents(line.amount_tax)||line.amount!==item.amount||line.quantity!==item.quantity||line.tax_code!==item.tax_code)return false;seen.add(line.reference);lineAmount+=line.amount;tax+=line.amount_tax;}
  let shippingAmount=0,shippingTax=0;if(tx.shipping_cost!=null){const shipping=tx.shipping_cost;if(!cents(shipping.amount)||!cents(shipping.amount_tax)||shipping.tax_behavior!=='exclusive'||shipping.tax_code!=='txcd_92010001')return false;shippingAmount=shipping.amount;shippingTax=shipping.amount_tax;if(shippingAmount!==expected.shippingCost.amount)return false;}
  if(lineAmount+shippingAmount!==expected.subtotalCents+expected.shippingCents)return false;
  const totalTax=tax+shippingTax,base=lineAmount+shippingAmount;
  return cents(totalTax)&&totalTax===expected.taxCents&&base+totalTax===expected.totalCents;
 }
 const publicRow=record=>({state:record.state,saleTransactionId:record.sale?.transactionId||null,reversalTransactionId:record.reversal?.transactionId||null});
 async function markReview(key,row,field,state){const next={...row.record,revision:row.record.revision+1,state,operation:sha([row.record.operation||'',field,state,row.record.revision+1]),[field]:{...row.record[field],state}};const saved=await persist(key,next,row.etag);return publicRow(saved.record);}
 async function postSale(orderId){
  guard();const {record,order,binding}=await orderAndBinding(orderId);await captured(order,binding);const key=orderTaxLedgerKey(accountId,orderId);let row=await store.read(key),ownsAttempt=false;
  if(!row){const initial=baseRecord(order,record,key,binding);try{await store.save(key,initial,null);row=await store.read(key);ownsAttempt=row?.record.operation===initial.operation;}catch{row=await store.read(key);if(!row)fail('Tax transaction intent could not be confirmed.',503);ownsAttempt=row.record.operation===initial.operation;}}
  const seal=sha([record.id,record.completedAt,record.order,record.taxCalculationId,record.taxLedgerBasis]);if(row.record.accountId!==accountId||row.record.seal!==seal||row.record.calculationId!==record.taxCalculationId||row.record.sale.paymentId!==binding.paymentId||row.record.sale.quoteDigest!==binding.quoteDigest)fail('Tax ledger scope differs from the finalized order.',409);
  const expected={reference:row.record.sale.reference,orderId,calculationId:record.taxCalculationId,paymentId:binding.paymentId,taxCents:order.taxCents,totalCents:order.totalCents,subtotalCents:order.subtotalCents,shippingCents:order.shippingCents,lines:record.taxLedgerBasis.lines,shippingCost:record.taxLedgerBasis.shippingCost};
  if(transactionId(row.record.sale.transactionId)){
   let tx;try{tx=await provider().tax.transactions.retrieve(row.record.sale.transactionId,{expand:['line_items']});}catch{fail('Saved tax transaction could not be verified.',503);}
   if(!matchesTransaction(tx,expected)){await markReview(key,row,'sale','sale-needs-review');return {state:'sale-needs-review',transactionId:null,reversalState:row.record.reversal?.state||'not-started'};}return {state:'sale-posted',transactionId:tx.id,reversalState:row.record.reversal?.state||'not-started'};
  }
  if(!ownsAttempt)fail('The durable tax attempt needs a provider transaction ID for read-only reconciliation; no second create will be sent.',409);
  const started=Date.parse(row.record.sale.attemptedAt);if(!Number.isFinite(started)||started>clock()+30000)fail('Tax transaction attempt time is invalid.',409);
  const operation=row.record.operation;
  let tx;try{tx=await provider().tax.transactions.createFromCalculation({calculation:record.taxCalculationId,reference:expected.reference,metadata:{tp_order_id:orderId,tp_tax_calculation_id:record.taxCalculationId,tp_payment_intent_id:binding.paymentId},expand:['line_items']},{idempotencyKey:row.record.sale.idempotencyKey});}catch{
   const latest=await store.read(key);if(latest?.record.operation!==operation)fail('Tax transaction attempt changed. Reconcile the same order.',409);
   const uncertain={...latest.record,revision:latest.record.revision+1,state:'sale-uncertain',operation:sha(['sale-uncertain',orderId,latest.record.revision+1]),sale:{...latest.record.sale,state:'uncertain'}};await persist(key,uncertain,latest.etag);return {state:'sale-uncertain',transactionId:null,reversalState:'not-started'};
  }
  if(!matchesTransaction(tx,expected)){
   const latest=await store.read(key);if(latest?.record.operation!==operation)fail('Tax transaction response changed during reconciliation.',409);const bad={...latest.record,revision:latest.record.revision+1,state:'sale-needs-review',operation:sha(['sale-mismatch',orderId,latest.record.revision+1]),sale:{...latest.record.sale,state:'needs-review'}};await persist(key,bad,latest.etag);return {state:'sale-needs-review',transactionId:null,reversalState:'not-started'};
  }
  const latest=await store.read(key);if(latest?.record.operation!==operation)fail('Tax transaction response arrived after a newer attempt.',409);const done={...latest.record,revision:latest.record.revision+1,state:'sale-posted',operation:sha(['sale-posted',tx.id]),sale:{...latest.record.sale,state:'posted',transactionId:tx.id,checkedAt:new Date(clock()).toISOString()}};const saved=await persist(key,done,latest.etag);return {state:saved.record.state,transactionId:tx.id,reversalState:saved.record.reversal?.state||'not-started'};
 }
 function validateRefund(proof,order,binding,capture){
  const checked=Date.parse(proof?.checkedAt);if(proof?.mode!=='test'||proof?.state!=='succeeded'||proof?.orderId!==order.id||proof?.paymentIntentId!==binding.paymentId||!/^ch_[A-Za-z0-9]{4,150}$/.test(proof?.chargeId||'')||proof.chargeId!==capture.chargeId||proof?.amountCents!==binding.amountCents||proof?.currency!=='usd'||!refundId(proof.refundId)||!Number.isFinite(checked)||checked>clock()+30000||clock()-checked>60000)fail('A fresh, exact successful full refund read is required before tax reversal.',409);
  return proof;
 }
 async function reverseFull(orderId){
  guard();if(typeof refundReader!=='function')fail('Tax reversal needs a trusted refund status reader.',503);
  const sale=await postSale(orderId);if(sale.state!=='sale-posted'||!transactionId(sale.transactionId))fail('The original tax sale must be verified before reversal.',409);
  const {record,order,binding}=await orderAndBinding(orderId),capture=await captured(order,binding),refund=validateRefund(await refundReader(orderId),order,binding,capture),key=orderTaxLedgerKey(accountId,orderId);let row=await store.read(key);
  if(row.record.state==='reversed'&&row.record.reversal?.refundId===refund.refundId){let tx;try{tx=await provider().tax.transactions.retrieve(row.record.reversal.transactionId,{expand:['line_items']});}catch{fail('Saved tax reversal could not be verified.',503);}if(!matchesReversal(tx,{orderId,transactionId:sale.transactionId,refundId:refund.refundId,taxCents:order.taxCents,totalCents:order.totalCents})) {await markReview(key,row,'reversal','reversal-needs-review');return {state:'reversal-needs-review',transactionId:sale.transactionId,reversalTransactionId:null};}return {state:'reversed',transactionId:sale.transactionId,reversalTransactionId:tx.id};}
  if(row.record.reversal&&row.record.reversal.refundId!==refund.refundId)fail('A different refund already has a tax reversal claim.',409);
  if(row.record.state==='reversal-needs-review')fail('Tax reversal needs manual reconciliation.',409);
  const reference='tp_test_reversal_'+orderId+'_'+refund.refundId;
  if(row.record.reversal&&['pending','uncertain','needs-review'].includes(row.record.reversal.state))fail('The durable tax reversal attempt needs its Stripe Tax transaction ID for read-only reconciliation.',409);
  const rev=row.record.reversal||{refundId:refund.refundId,reference,idempotencyKey:'tp-tax-reversal-'+sha([accountId,orderId,refund.refundId,row.record.sale.transactionId]),state:'pending',attemptedAt:new Date(clock()).toISOString(),transactionId:null};
  if(rev.reference!==reference)fail('Saved tax reversal scope does not match the refund.',409);
  const operation=randomUUID(),pending={...row.record,revision:row.record.revision+1,state:'reversal-pending',operation,reversal:{...rev,state:'pending'}};row=await persist(key,pending,row.etag);
  let tx;try{tx=await provider().tax.transactions.createReversal({mode:'full',original_transaction:sale.transactionId,reference,metadata:{tp_order_id:orderId,tp_refund_id:refund.refundId},expand:['line_items']},{idempotencyKey:rev.idempotencyKey});}catch{
   const latest=await store.read(key);if(latest?.record.operation!==operation)fail('Tax reversal attempt changed. Reconcile the same order.',409);const uncertain={...latest.record,revision:latest.record.revision+1,state:'reversal-uncertain',operation:sha(['reversal-uncertain',orderId,latest.record.revision+1]),reversal:{...latest.record.reversal,state:'uncertain'}};await persist(key,uncertain,latest.etag);return {state:'reversal-uncertain',transactionId:sale.transactionId,reversalTransactionId:null};
  }
  if(!matchesReversal(tx,{orderId,transactionId:sale.transactionId,refundId:refund.refundId,taxCents:order.taxCents,totalCents:order.totalCents})){
   const latest=await store.read(key);if(latest?.record.operation!==operation)fail('Tax reversal response arrived after a newer operation.',409);const bad={...latest.record,revision:latest.record.revision+1,state:'reversal-needs-review',operation:sha(['reversal-mismatch',orderId,latest.record.revision+1]),reversal:{...latest.record.reversal,state:'needs-review'}};await persist(key,bad,latest.etag);return {state:'reversal-needs-review',transactionId:sale.transactionId,reversalTransactionId:null};
  }
  const latest=await store.read(key);if(latest?.record.operation!==operation)fail('Tax reversal response arrived after a newer operation.',409);const done={...latest.record,revision:latest.record.revision+1,state:'reversed',operation:sha(['reversal-done',tx.id]),reversal:{...latest.record.reversal,state:'reversed',transactionId:tx.id,checkedAt:new Date(clock()).toISOString()}};await persist(key,done,latest.etag);return {state:'reversed',transactionId:sale.transactionId,reversalTransactionId:tx.id};
 }
 function matchesReversal(tx,{orderId,transactionId:original,refundId:refId,taxCents,totalCents}){
  if(tx?.object!=='tax.transaction'||!transactionId(tx.id)||tx.livemode!==false||tx.type!=='reversal'||tx.currency!=='usd'||tx.reference!=='tp_test_reversal_'+orderId+'_'+refId||tx.metadata?.tp_order_id!==orderId||tx.metadata?.tp_refund_id!==refId||tx.reversal?.original_transaction!==original||!tx.line_items||tx.line_items.object!=='list'||!Array.isArray(tx.line_items.data)||!tx.line_items.data.length||tx.line_items.has_more!==false)return false;
  if(tx.line_items.data.some(line=>line?.object!=='tax.transaction_line_item'||line.type!=='reversal'||line.livemode!==false||line.tax_behavior!=='exclusive'||!Number.isSafeInteger(line.amount)||line.amount>0||!Number.isSafeInteger(line.amount_tax)||line.amount_tax>0||!/^tax_li_[A-Za-z0-9]{4,150}$/.test(line.reversal?.original_line_item||'')))return false;
  const tax=tx.line_items.data.reduce((n,line)=>n+line.amount_tax,0)+(Number.isSafeInteger(tx.shipping_cost?.amount_tax)?tx.shipping_cost.amount_tax:0);
  const subtotal=tx.line_items.data.reduce((n,line)=>n+line.amount,0)+(Number.isSafeInteger(tx.shipping_cost?.amount)?tx.shipping_cost.amount:0);
  if(tx.shipping_cost!=null&&(!Number.isSafeInteger(tx.shipping_cost.amount)||tx.shipping_cost.amount>0||!Number.isSafeInteger(tx.shipping_cost.amount_tax)||tx.shipping_cost.amount_tax>0||tx.shipping_cost.tax_behavior!=='exclusive'||!/^txcd_\d{8}$/.test(tx.shipping_cost.tax_code||'')))return false;
  return Number.isSafeInteger(tax)&&tax===-taxCents&&Number.isSafeInteger(subtotal)&&subtotal+tax===-totalCents;
 }
 async function read(orderId){readGuard();if(!uuid(orderId))fail('Invalid order reference.',400);const row=await store.read(orderTaxLedgerKey(accountId,orderId));if(!row)return {mode:'test',orderId,state:'not-started',saleTransactionId:null,reversalTransactionId:null};return {mode:'test',orderId,state:row.record.state,saleTransactionId:row.record.sale.transactionId||null,reversalTransactionId:row.record.reversal?.transactionId||null};}
  async function reconcileSale(orderId,providerTransactionId){
  guard();if(!transactionId(providerTransactionId))fail('A Stripe Tax transaction ID is required for read-only reconciliation.',400);
  const {record,order,binding}=await orderAndBinding(orderId);await captured(order,binding);const key=orderTaxLedgerKey(accountId,orderId),row=await store.read(key);if(!row)fail('No durable tax creation attempt exists for this order.',404);
  const seal=sha([record.id,record.completedAt,record.order,record.taxCalculationId,record.taxLedgerBasis]);if(row.record.accountId!==accountId||row.record.orderId!==orderId||row.record.seal!==seal||row.record.calculationId!==record.taxCalculationId||row.record.sale.paymentId!==binding.paymentId||row.record.sale.quoteDigest!==binding.quoteDigest||row.record.state==='reversed'||row.record.state.startsWith('reversal-')||(row.record.sale.transactionId&&row.record.sale.transactionId!==providerTransactionId))fail('Tax ledger scope is not eligible for sale reconciliation.',409);
  let tx;try{tx=await provider().tax.transactions.retrieve(providerTransactionId,{expand:['line_items']});}catch{fail('Tax transaction could not be read. No retry was made.',503);}
  const expected={reference:row.record.sale.reference,orderId,calculationId:record.taxCalculationId,paymentId:binding.paymentId,taxCents:order.taxCents,totalCents:order.totalCents,subtotalCents:order.subtotalCents,shippingCents:order.shippingCents,lines:record.taxLedgerBasis.lines,shippingCost:record.taxLedgerBasis.shippingCost};if(!matchesTransaction(tx,expected))fail('Provider tax transaction does not match this exact order; no ledger approval was saved.',409);
  const done={...row.record,revision:row.record.revision+1,state:'sale-posted',operation:sha(['sale-reconciled',tx.id]),sale:{...row.record.sale,state:'posted',transactionId:tx.id,checkedAt:new Date(clock()).toISOString()}};await persist(key,done,row.etag);return {state:'sale-posted',transactionId:tx.id,reversalState:row.record.reversal?.state||'not-started'};
 }
 async function reconcileReversal(orderId,providerTransactionId){
  guard();if(!transactionId(providerTransactionId))fail('A Stripe Tax reversal ID is required for read-only reconciliation.',400);
  if(typeof refundReader!=='function')fail('Tax reversal needs a trusted refund status reader.',503);
  const {record,order,binding}=await orderAndBinding(orderId),capture=await captured(order,binding),refund=validateRefund(await refundReader(orderId),order,binding,capture),key=orderTaxLedgerKey(accountId,orderId),row=await store.read(key);if(!row?.record.reversal||row.record.accountId!==accountId||row.record.orderId!==orderId||row.record.seal!==sha([record.id,record.completedAt,record.order,record.taxCalculationId,record.taxLedgerBasis])||row.record.calculationId!==record.taxCalculationId||row.record.sale.paymentId!==binding.paymentId||row.record.reversal.refundId!==refund.refundId||row.record.reversal.reference!=='tp_test_reversal_'+orderId+'_'+refund.refundId||!transactionId(row.record.sale.transactionId)||!['reversal-pending','reversal-uncertain','reversal-needs-review','reversed'].includes(row.record.state)||(row.record.reversal.transactionId&&row.record.reversal.transactionId!==providerTransactionId))fail('No matching durable reversal attempt exists.',404);
  let tx;try{tx=await provider().tax.transactions.retrieve(providerTransactionId,{expand:['line_items']});}catch{fail('Tax reversal could not be read. No retry was made.',503);}
  if(!matchesReversal(tx,{orderId,transactionId:row.record.sale.transactionId,refundId:refund.refundId,taxCents:order.taxCents,totalCents:order.totalCents}))fail('Provider tax reversal does not match this exact full refund.',409);
  const done={...row.record,revision:row.record.revision+1,state:'reversed',operation:sha(['reversal-reconciled',tx.id]),reversal:{...row.record.reversal,state:'reversed',transactionId:tx.id,checkedAt:new Date(clock()).toISOString()}};await persist(key,done,row.etag);return {state:'reversed',transactionId:row.record.sale.transactionId,reversalTransactionId:tx.id};
 }
 return {postSale,reconcileSale,reverseFull,reconcileReversal,read,configuration:()=>({enabled:readable()&&environment.TP_STRIPE_TEST_TAX_LEDGER_ENABLED==='true',readable:readable(),mode:'test',liveTaxLedgerEnabled:false,productionEnabled:false})};
}
