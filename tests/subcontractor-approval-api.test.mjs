import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/notifications.js';
import {sign} from '../lib/security.mjs';
import {opportunityStore} from '../lib/opportunity-storage.mjs';
process.env.TP_SESSION_SECRET='synthetic-network-test-secret-is-over-thirty-two-characters';
process.env.NODE_ENV='test';
process.env.VERCEL_ENV='preview';

const id='5335d560-53a0-4f5b-b8b6-c50e322c0788';
const cookie='__Host-tp_admin='+sign({type:'admin',at:Date.now()});
function profile(status='new'){
 return {id,status,company:'Synthetic Test Trades',email:'trades@example.net',consent:true,
  trade:'janitorial',reviewedAt:status==='reviewed'?'2026-11-22T12:00:00Z':undefined};
}
async function call({method='GET',url='/api/notifications',body,cookieHeader=cookie,origin='http://localhost:3000'}={}){
 const headers={origin,cookie:cookieHeader,'content-type':'application/json'};
 const req={method,url,headers,body,query:{}};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.text=v}};
 await handler(req,res);
 return {status:res.statusCode,json:JSON.parse(res.text),headers:res.headers};
}
function withStore(record){
 let version=1,profileRecord=structuredClone(record),saves=0;
 const before={...opportunityStore};
 opportunityStore.pageProfiles=async()=>({records:[structuredClone(profileRecord)],hasMore:false,cursor:null});
 opportunityStore.readProfile=async k=>{assert.equal(k,id);return {record:structuredClone(profileRecord),etag:String(version)}};
 opportunityStore.saveProfile=async (next,etag)=>{
  assert.equal(etag,String(version));version++;saves++;profileRecord=structuredClone(next);
 };
 return {get record(){return profileRecord},get saves(){return saves},restore(){Object.assign(opportunityStore,before)}};
}
test('review, approval, and preview require admin and an unmodified Origin',async()=>{
 const store=withStore(profile());
 try{
  assert.equal((await call({cookieHeader:''})).status,401);
  assert.equal((await call({method:'POST',body:{action:'mark-reviewed',id,expectedStatus:'new',confirmed:true},cookieHeader:''})).status,401);
  assert.equal((await call({method:'POST',body:{action:'mark-reviewed',id,expectedStatus:'new',confirmed:true},origin:'https://attacker.invalid'})).status,403);
  assert.equal(store.saves,0);
  const reviewed=await call({method:'POST',body:{action:'mark-reviewed',id,expectedStatus:'new',confirmed:true}});
  assert.equal(reviewed.status,200);assert.equal(reviewed.json.status,'reviewed');
  const preview=await call({url:'/api/notifications?view=welcome-preview&id='+id});
  assert.equal(preview.status,200);assert.equal(preview.json.previewOnly,true);
  assert.match(preview.json.text,/approved to participate/);
  assert.equal(preview.json.deliveryEnabled,false);
  const approve=await call({method:'POST',body:{action:'approve',id,expectedStatus:'reviewed',confirmed:true}});
  assert.equal(approve.status,200);assert.equal(approve.json.status,'approved');assert.equal(approve.json.welcomeNotice,'held');
  assert.equal(store.record.welcomeNotice.state,'held');
  const duplicate=await call({method:'POST',body:{action:'approve',id,expectedStatus:'reviewed',confirmed:true}});
  assert.equal(duplicate.status,409);assert.equal(store.saves,2);
  const manualSend=await call({method:'POST',body:{action:'send-welcome',id,confirmed:true}});
  assert.equal(manualSend.status,503);assert.equal(store.saves,2);
 }finally{store.restore()}
});
test('decline is not approval and sends no applicant email',async()=>{
 const store=withStore(profile('reviewed'));
 try{
  const result=await call({method:'POST',body:{action:'decline',id,expectedStatus:'reviewed',confirmed:true}});
  assert.equal(result.status,200);assert.equal(store.record.status,'declined');assert.equal(store.record.welcomeNotice,undefined);
  const preview=await call({url:'/api/notifications?view=welcome-preview&id='+id});
  assert.equal(preview.status,409);
  const duplicate=await call({method:'POST',body:{action:'decline',id,expectedStatus:'declined',confirmed:true}});
  assert.equal(duplicate.status,409);
  assert.equal(store.saves,1);
 }finally{store.restore()}
});
test('application counts keep new, reviewed, approved, and declined distinct',async()=>{
 const before={...opportunityStore};
 try{
  opportunityStore.pageProfiles=async()=>({records:[profile(),profile('reviewed'),profile('approved'),profile('declined')],hasMore:false});
  const r=await call();assert.equal(r.status,200);
  assert.deepEqual([r.json.newCount,r.json.reviewedCount,r.json.approvedCount,r.json.declinedCount],[1,1,1,1]);
 }finally{Object.assign(opportunityStore,before)}
});
