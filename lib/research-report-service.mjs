import {HttpError} from './model.mjs';
import {compactResearchRun,mergeResearch,researchReport,researchIdentity} from './research-report.mjs';
export function createResearchService({store,product,collector,clock=()=>Date.now()}){
 return {async read(id){const p=await product(id),{record}=await store.read(p);return researchReport(record,p,{nowMs:clock()});},
  async search(id,options){const p=await product(id);
   // Check storage access first. A failed save will not trigger another charged query.
   await store.read(p);const startedAt=new Date(clock()).toISOString();const result=await collector.search(p,options),run={...compactResearchRun(result,p),startedAt};
   const latest=await product(id);if(JSON.stringify(researchIdentity(p))!==JSON.stringify(researchIdentity(latest)))throw new HttpError(409,'Product identity changed during research. Results were not saved.');
   for(let attempt=0;attempt<3;attempt++){
    try{const {record,etag}=await store.read(p),merged=mergeResearch(record,p,run);if(merged.changed)await store.save(merged.record,etag);return {...result,researchSummary:researchReport(merged.record,p,{nowMs:clock()}),researchSaved:['saved','unchanged'].includes(merged.disposition),researchSummarySaved:true,researchDisposition:merged.disposition,...(!['saved','unchanged'].includes(merged.disposition)?{saveWarning:'Another equally recent or newer research run was retained. The summary is the retained saved report, not the incoming candidates.'}:{})};}
    catch(e){if(e.status===409&&attempt<2)continue;
     // Do not invite blind billable retries after a completed provider call.
     return {...result,researchSummary:researchReport(mergeResearch({schemaVersion:1,mode:'preview',productId:p.id,revision:0,identity:researchIdentity(p),runs:{}},p,run).record,p,{nowMs:clock()}),researchSaved:false,researchSummarySaved:false,saveWarning:'Search finished, but its report could not be saved. This is a temporary result; do not repeat the search just to retry storage.'};}
   }
  }
 };
}
