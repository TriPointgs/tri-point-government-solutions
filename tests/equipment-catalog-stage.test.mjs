import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sign} from '../lib/security.mjs';
import handler from '../api/equipment-import.js';
import {
  SYNTHETIC_CATALOG_FORMAT,SYNTHETIC_STOCK_FORMAT,
  stageSyntheticCatalog,reconcileSyntheticStock,syntheticImportReport
} from '../lib/equipment-catalog-stage.mjs';

const catalogCsv=readFileSync(new URL('./fixtures/equipment-synthetic-catalog.csv',import.meta.url),'utf8');
const stockCsv=readFileSync(new URL('./fixtures/equipment-synthetic-stock.csv',import.meta.url),'utf8');
const receivedAt='2026-10-11T03:00:00Z';
const stage=()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:catalogCsv,receivedAt});
const stock=(csv=stockCsv,mode='full',catalog=stage())=>reconcileSyntheticStock(catalog,{format:SYNTHETIC_STOCK_FORMAT,csv,mode});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(raw){this.data=JSON.parse(raw);}});

test('full dry-run accepts explicit synthetic fixture, parses quoted descriptions and records no sale capability',()=>{
  const first=stage();
  assert.equal(first.summary.rows,5);
  assert.equal(first.summary.uniqueSkus,5);
  assert.equal(first.summary.unpriced,1);
  assert.equal(first.summary.stockUnknown,5);
  assert.equal(first.records.find(p=>p.sku==='SYN-2002').description,'SYNTHETIC 24-port, managed switch');
  assert.equal(first.records.every(p=>p.authorized===false&&p.checkedAt===null),true);
  const second=stock();
  assert.equal(second.summary.stockUnknown,0);
  assert.equal(second.summary.zeroStock,1);
  assert.equal(second.summary.stockChangeCount,5);
  assert.equal(second.records.every(p=>p.authorized===false&&p.checkedAt===null),true);
  const report=syntheticImportReport({catalogCsv,stockCsv,receivedAt});
  assert.equal(report.source,'SYNTHETIC_ONLY');
  assert.equal(report.safeForCustomerQuote,false);
  assert.equal(report.enabledForWebsite,false);
  assert.equal(report.supplierApiCalled,false);
  assert.equal(report.orderSubmissionEnabled,false);
  assert.equal(report.summary.published,false);
  assert.equal(report.summary.persisted,false);
  assert.equal(JSON.stringify(report).includes('89950'),false); // Costs never appear in API summary.
});
test('duplicate SKUs and unrecognized schema fail before providing partial results',()=>{
  const duplicate=catalogCsv+catalogCsv.split('\n')[1]+'\n';
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:duplicate,receivedAt}),/Duplicate/);
  assert.throws(()=>stageSyntheticCatalog({format:'REAL_TD_SYNNEX_V4.7',csv:catalogCsv,receivedAt}),/Unsupported/);
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:catalogCsv.replace('unitCost','price'),receivedAt}),/Unknown feed columns/);
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:catalogCsv.replace('SYN-1001','439866'),receivedAt}),/Invalid synthetic SKU/);
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:'',receivedAt}),/empty/);
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:catalogCsv,receivedAt:'2026-02-30T00:00:00Z'}),/Invalid catalog/);
});
test('inventory full batches require full coverage and known exact SKUs',()=>{
  const partial='sku,quantity,stockAt\nSYN-1001,3,2026-10-11T02:00:00Z\n';
  assert.throws(()=>stock(partial,'full'),/Full stock feed/);
  const delta=stock(partial,'delta');
  assert.equal(delta.records.find(p=>p.sku==='SYN-1001').stockQuantity,3);
  assert.equal(delta.records.find(p=>p.sku==='SYN-2002').stockQuantity,null);
  assert.equal(delta.summary.stockUnknown,4);
  assert.throws(()=>stock(partial.replace('SYN-1001','SYN-MISSING'),'delta'),/absent from/);
  assert.throws(()=>stock(partial.replace(',3,',',-3,'),'delta'),/whole-number/);
  assert.throws(()=>stock(partial+partial.split('\n')[1],'delta'),/Duplicate/);
});
test('out-of-order changes fail; exact replay is idempotent',()=>{
  const first=stock();
  const repeat=stock(stockCsv,'full',first);
  assert.equal(repeat.summary.stockChangeCount,0);
  const old='sku,quantity,stockAt\nSYN-1001,20,2026-10-11T01:00:00Z\n';
  assert.throws(()=>stock(old,'delta',first),/Out-of-order/);
  const conflicting='sku,quantity,stockAt\nSYN-1001,20,2026-10-11T02:00:00Z\n';
  assert.throws(()=>stock(conflicting,'delta',first),/Conflicting/);
  const newer='sku,quantity,stockAt\nSYN-1001,12,2026-10-11T03:00:00Z\n';
  const updated=stock(newer,'delta',first);
  assert.equal(updated.records.find(p=>p.sku==='SYN-1001').stockQuantity,12);
  assert.equal(updated.records.find(p=>p.sku==='SYN-1001').checkedAt,null);
});
test('CSV parser rejects malformed quoting, huge and empty inputs',()=>{
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:catalogCsv+'bad,record\n',receivedAt}),/columns/);
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:catalogCsv.replace('SYNTHETIC 14-inch laptop','"no close'),receivedAt}),/Unclosed|Invalid characters after quoted CSV field/);
  assert.throws(()=>stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:'x'.repeat(132000),receivedAt}),/size limit/);
});
test('API denies anonymous and cross-site POST before accepting any catalog data',async()=>{
  process.env.TP_SESSION_SECRET='synthetic-only-equipment-tests-not-production';
  process.env.VERCEL_ENV='preview';
  const b={action:'dryRunSynthetic',confirmSynthetic:true,catalogCsv,stockCsv};
  const anon=response();
  await handler({method:'POST',headers:{origin:'https://tripointgs.com','content-type':'application/json'},body:b},anon);
  assert.equal(anon.statusCode,401);
  const cookie='__Host-tp_admin='+sign({type:'admin',at:Date.now()});
  const foreign=response();
  await handler({method:'POST',headers:{cookie,origin:'https://untrusted.example','content-type':'application/json'},body:b},foreign);
  assert.equal(foreign.statusCode,403);
  const allowed=response();
  await handler({method:'POST',headers:{cookie,origin:'https://tripointgs.com','content-type':'application/json'},body:b},allowed);
  assert.equal(allowed.statusCode,200);
  assert.equal(allowed.data.summary.rows,5);
  assert.equal(allowed.data.safeForCustomerQuote,false);
  assert.doesNotMatch(JSON.stringify(allowed.data),/89950|24999|unitCostCents/);
});
test('API refuses production simulation and unknown operations, even if authenticated',async()=>{
  process.env.TP_SESSION_SECRET='synthetic-only-equipment-tests-not-production';
  const cookie='__Host-tp_admin='+sign({type:'admin',at:Date.now()});
  process.env.VERCEL_ENV='production';
  const denied=response();
  await handler({method:'POST',headers:{cookie,origin:'https://tripointgs.com','content-type':'application/json'},body:{action:'dryRunSynthetic',confirmSynthetic:true,catalogCsv,stockCsv}},denied);
  assert.equal(denied.statusCode,404);
  process.env.VERCEL_ENV='preview';
  const unknown=response();
  await handler({method:'POST',headers:{cookie,origin:'https://tripointgs.com','content-type':'application/json'},body:{action:'publish',confirmSynthetic:true,catalogCsv,stockCsv}},unknown);
  assert.equal(unknown.statusCode,400);
});
