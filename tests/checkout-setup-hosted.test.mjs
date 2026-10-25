// Opt-in private Blob test. Synthetic drafts only; no policy, Stripe or TD calls.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {get,put,head,del} from '@vercel/blob';
import {createCheckoutSetupService,createCheckoutSetupStore,emptySetupFields} from '../lib/checkout-setup-store.mjs';
const enabled=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/td-product-controls'&&process.env.TP_BLOB_STORAGE_CANARY==='diagnose';
test('private setup draft roundtrip, replay and conflicting editors on real Blob',{skip:!enabled,timeout:45000},async()=>{
 const root='preview/checkout-setup-canary/v1/'+randomUUID()+'/',paths=new Set();
 const location=p=>{assert.match(p,/^preview\/checkout-setup\/v1\/[a-f0-9]{64}\/draft.json$/);return root+createHash('sha256').update(p).digest('hex')+'.json';};
 const blob={get:(p,o)=>get(location(p),o),put:async(p,b,o)=>{const path=location(p);paths.add(path);return put(path,b,o);}};
 const env={VERCEL_ENV:'preview',TP_STRIPE_TEST_ACCOUNT_ID:'acct_SYNTHETICSETUPHOSTED'},service=createCheckoutSetupService({env,store:createCheckoutSetupStore({env,blob})});
 const report={realBlob:true,syntheticDraftOnly:true,roundtrip:false,replay:false,conflictBlocked:false,merchantIsolation:false,noActivation:false,cleanup:false};
 try{
  const request={writeId:randomUUID(),expectedRevision:0,fields:{...emptySetupFields(),termsVersion:'synthetic-1',termsText:'Synthetic storage test only. Not adopted purchase terms.'}};
  const first=await service.save(request),read=await service.read();report.roundtrip=first.revision===1&&read.contentDigest===first.contentDigest&&read.fields.termsText===request.fields.termsText;
  const replay=await service.save(request);report.replay=replay.duplicate===true&&replay.revision===1;
  const changes=await Promise.allSettled(['A','B'].map(x=>service.save({writeId:randomUUID(),expectedRevision:1,fields:{...request.fields,shippingNotes:'Synthetic editor '+x}})));
  report.conflictBlocked=changes.filter(x=>x.status==='fulfilled').length===1&&changes.filter(x=>x.status==='rejected'&&x.reason.status===409).length===1;
  const other={...env,TP_STRIPE_TEST_ACCOUNT_ID:'acct_SYNTHETICOTHERHOSTED'};report.merchantIsolation=(await createCheckoutSetupService({env:other,store:createCheckoutSetupStore({env:other,blob})}).read()).revision===0;
  const final=await service.read();report.noActivation=final.state==='draft'&&final.approved===false&&final.checkoutActivated===false;
 }finally{let clean=true;for(const path of paths){try{await del(path,{ifMatch:(await head(path)).etag});if(await get(path,{access:'private',useCache:false}))clean=false;}catch{try{if(await get(path,{access:'private',useCache:false}))clean=false;}catch{clean=false;}}}report.cleanup=clean;console.info('TP_CHECKOUT_SETUP_CANARY',JSON.stringify(report));}
 for(const key of ['roundtrip','replay','conflictBlocked','merchantIsolation','noActivation','cleanup'])assert.equal(report[key],true,key);
});
