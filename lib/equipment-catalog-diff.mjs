import {HttpError} from './model.mjs';

const ensure=(ok,message)=>{if(!ok)throw new HttpError(400,message);};
const safeRow=r=>r&&typeof r==='object'&&r.source==='SYNTHETIC_ONLY'&&typeof r.sku==='string'&&r.sku.startsWith('SYN-');

function checkedStage(stage,label){
  ensure(stage&&stage.source==='SYNTHETIC_ONLY'&&Array.isArray(stage.records)&&
    stage.summary?.previewOnly===true&&stage.summary?.published===false&&stage.summary?.persisted===false,
    'Only synthetic staging data may be compared.');
  ensure(typeof stage.receivedAt==='string'&&Number.isFinite(Date.parse(stage.receivedAt)),'Invalid stage timestamp.');
  ensure(stage.records.length<=250&&stage.records.every(safeRow),'Invalid staged synthetic records.');
  ensure(typeof stage.digest==='string'&&/^[a-f0-9]{64}$/.test(stage.digest),'Missing catalog checksum.');
  const keys=stage.records.map(r=>r.sku+'|'+r.priceType);
  ensure(new Set(keys).size===keys.length,'Duplicate SKU pricing keys in '+label+'.');
  return new Map(stage.records.map(r=>[r.sku+'|'+r.priceType,r]));
}

/**
 * Preview-only change-control plan. This never creates an approval or release.
 * Change reports contain no wholesale prices, price differences or raw records.
 * Conservative gates must be re-evaluated against approved live feeds in a later phase.
 */
export function planSyntheticCatalogUpdate(previous,next,{maxRemovedPercent=20,maxChangedPercent=60}={}){
  const prior=checkedStage(previous,'prior catalog');
  const current=checkedStage(next,'new catalog');
  ensure(Number.isInteger(maxRemovedPercent)&&maxRemovedPercent>=0&&maxRemovedPercent<=100,'Invalid removal gate.');
  ensure(Number.isInteger(maxChangedPercent)&&maxChangedPercent>=0&&maxChangedPercent<=100,'Invalid change gate.');
  const oldTime=Date.parse(previous.receivedAt),newTime=Date.parse(next.receivedAt);
  ensure(newTime>=oldTime,'Older catalog snapshot cannot replace a newer snapshot.');
  if(newTime===oldTime)ensure(previous.digest===next.digest,'Conflicting catalog content with identical receipt time.');

  const diffs=[];
  for(const [key,a] of prior){
    const b=current.get(key);
    if(!b){diffs.push({sku:a.sku,priceType:a.priceType,change:'removed',requiresReview:true});continue;}
    const changes=[];
    if(a.unitCostCents!==b.unitCostCents)changes.push('supplier-price-changed');
    if(a.status!==b.status)changes.push('product-status-changed');
    if(a.description!==b.description||a.category!==b.category||a.mfgPN!==b.mfgPN||a.manufacturer!==b.manufacturer)
      changes.push('product-details-changed');
    if(a.authorized!==b.authorized||a.checkedAt!==b.checkedAt)changes.push('approval-state-changed');
    if(changes.length)diffs.push({sku:a.sku,priceType:a.priceType,change:'modified',fields:changes,requiresReview:true});
  }
  for(const [key,b] of current){
    if(!prior.has(key))diffs.push({sku:b.sku,priceType:b.priceType,change:'added',requiresReview:true});
  }
  diffs.sort((a,b)=>a.sku.localeCompare(b.sku)||a.priceType.localeCompare(b.priceType));
  const removed=diffs.filter(r=>r.change==='removed').length;
  const added=diffs.filter(r=>r.change==='added').length;
  const modified=diffs.filter(r=>r.change==='modified').length;
  const priceChanges=diffs.filter(r=>r.fields?.includes('supplier-price-changed')).length;
  const statusChanges=diffs.filter(r=>r.fields?.includes('product-status-changed')).length;
  const removedPercent=prior.size?Math.ceil(removed*100/prior.size):0;
  const changedPercent=prior.size?Math.ceil((removed+modified)*100/prior.size):100;
  const hardStops=[];
  if(removedPercent>maxRemovedPercent)hardStops.push('Bulk catalog removals exceed policy limit.');
  if(changedPercent>maxChangedPercent)hardStops.push('Bulk catalog changes exceed policy limit.');
  if([...current.values()].some(r=>r.authorized===true||r.checkedAt!==null))
    hardStops.push('Synthetic snapshot unexpectedly contains authorized or verified products.');
  const warnings=[];
  if(added)warnings.push('New products require manufacturer and rights review.');
  if(priceChanges)warnings.push('Supplier price changes require margin recalculation.');
  if(statusChanges||removed)warnings.push('Discontinued, changed or removed SKUs require stop-sale checks.');
  return {
    source:'SYNTHETIC_ONLY',
    oldDigest:previous.digest,newDigest:next.digest,
    changed:diffs.length>0,counts:{prior:prior.size,current:current.size,added,removed,modified,priceChanges,statusChanges},
    removedPercent,changedPercent,hardStops,warnings,
    changes:diffs.slice(0,100),changesTruncated:diffs.length>100,
    requiresManualReview:diffs.length>0||hardStops.length>0,
    canAutoPublish:false,canQuoteFromFeed:false,persisted:false,applied:false
  };
}
