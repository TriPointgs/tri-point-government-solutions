import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stageSyntheticCatalog,SYNTHETIC_CATALOG_FORMAT} from '../lib/equipment-catalog-stage.mjs';
import {planSyntheticCatalogUpdate} from '../lib/equipment-catalog-diff.mjs';

const csv=readFileSync(new URL('./fixtures/equipment-synthetic-catalog.csv',import.meta.url),'utf8');
const stage=(source,receivedAt='2026-10-12T04:00:00Z')=>
  stageSyntheticCatalog({format:SYNTHETIC_CATALOG_FORMAT,csv:source,receivedAt});
const revised=(source)=>stage(source,'2026-10-12T05:00:00Z');

test('same synthetic snapshot requires no review and never enables publication',()=>{
 const p=stage(csv),n=revised(csv);
 const report=planSyntheticCatalogUpdate(p,n);
 assert.equal(report.changed,false);
 assert.equal(report.requiresManualReview,false);
 assert.equal(report.counts.prior,5);
 assert.equal(report.counts.current,5);
 assert.equal(report.canAutoPublish,false);
 assert.equal(report.canQuoteFromFeed,false);
 assert.equal(report.persisted,false);
 assert.equal(report.applied,false);
});

test('SKU additions, removals, price changes and status changes are summarized without costs',()=>{
 const old=stage(csv);
 const modified=csv.replace('899.50','999.50')
   .replace('Discontinued,REGULAR','Inactive,REGULAR')
   .replace(/^SYN-5005,.*\r?\n/m,'')
   +'SYN-6006,SYN-MON-06,Example Display,SYNTHETIC replacement model,Monitors and peripherals,Active,REGULAR,97.00\n';
 const report=planSyntheticCatalogUpdate(old,revised(modified));
 assert.equal(report.changed,true);
 assert.deepEqual(
  [report.counts.added,report.counts.removed,report.counts.modified,report.counts.priceChanges,report.counts.statusChanges],
  [1,1,2,1,1]
 );
 assert.equal(report.removedPercent,20);
 assert.equal(report.changedPercent,60);
 assert.deepEqual(report.hardStops,[]);
 assert.equal(report.requiresManualReview,true);
 assert.ok(report.warnings.length>=2);
 assert.ok(report.changes.every(r=>r.requiresReview&&r.sku.startsWith('SYN-')));
 const publicReport=JSON.stringify(report);
 for(const privateValue of ['99950','999.50','899.50','unitCostCents','9700'])assert.equal(publicReport.includes(privateValue),false,privateValue);
});
test('large SKU removals or mass modifications produce hard stops',()=>{
 const old=stage(csv);
 const removedTwo=csv.replace(/^SYN-4004,.*\r?\n/m,'').replace(/^SYN-5005,.*\r?\n/m,'');
 const removals=planSyntheticCatalogUpdate(old,revised(removedTwo));
 assert.equal(removals.removedPercent,40);
 assert.equal(removals.hardStops.some(s=>s.includes('removals')),true);
 const allChanged=csv.replace('899.50','899.51').replace('249.99','250.00')
  .replace('129.00','130.00').replace('110.00','115.00');
 const bulk=planSyntheticCatalogUpdate(old,revised(allChanged));
 assert.equal(bulk.changedPercent,80);
 assert.equal(bulk.hardStops.some(s=>s.includes('changes')),true);
});
test('stale and conflicting full snapshots cannot silently replace current state',()=>{
 const old=stage(csv,'2026-10-12T04:00:00Z');
 const earlier=stage(csv,'2026-10-12T03:00:00Z');
 assert.throws(()=>planSyntheticCatalogUpdate(old,earlier),/Older catalog/);
 const conflicting=stage(csv.replace('899.50','900.00'),'2026-10-12T04:00:00Z');
 assert.throws(()=>planSyntheticCatalogUpdate(old,conflicting),/Conflicting catalog/);
});
test('non-synthetic feed stages, invalid policy and forged release flags are rejected or blocked',()=>{
 const old=stage(csv);
 const next=revised(csv);
 assert.throws(()=>planSyntheticCatalogUpdate({...old,source:'TD_SYNNEX'},next),/Only synthetic/);
 assert.throws(()=>planSyntheticCatalogUpdate(old,next,{maxRemovedPercent:101}),/Invalid removal/);
 const forged={...next,records:next.records.map((r,i)=>i?{...r}:{...r,authorized:true})};
 const result=planSyntheticCatalogUpdate(old,forged);
 assert.equal(result.canAutoPublish,false);
 assert.ok(result.hardStops.some(s=>s.includes('authorized')));
});
