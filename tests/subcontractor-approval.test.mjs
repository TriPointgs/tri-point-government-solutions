import test from 'node:test';
import assert from 'node:assert/strict';
import {decideProfile,welcomeEmail,welcomeEmailSettings,saveDecision,dispatchWelcomeOnce} from '../lib/subcontractor-approval.mjs';

const id='5da315c2-52f5-4d7f-8d88-1a84f2c4cb75';
const reviewed=()=>({id,company:'Sample Operations',email:'contractor@example.org',consent:true,status:'reviewed',reviewedAt:'2026-11-22T01:00:00.000Z',internalBidNote:'DO_NOT_DISCLOSE',trade:'janitorial'});
function store(initial=reviewed()){
 let record=structuredClone(initial),version=1;
 const writes=[];
 return {
  get record(){return structuredClone(record)},
  get writes(){return writes},
  async readProfile(){return {record:structuredClone(record),etag:String(version)}},
  async saveProfile(next,etag){
   if(etag!==String(version))throw new Error('precondition conflict');
   record=structuredClone(next);version++;writes.push({etag,record:structuredClone(next)});
  }
 };
}
test('reviewing does not imply approval, and review-only action never makes a welcome notice',()=>{
 const input={...reviewed(),status:'new',reviewedAt:undefined};
 const result=decideProfile(input,'mark-reviewed',{expectedStatus:'new',confirmed:true});
 assert.equal(result.status,'reviewed');assert.equal(result.welcomeNotice,undefined);
 assert.equal(input.status,'new');assert.equal(result.decisionHistory.at(-1).actor,'Tri-Point administrator');
});
test('requires exact explicit decision and only allows approval from reviewed',()=>{
 const p=reviewed();
 assert.throws(()=>decideProfile(p,'approve',{expectedStatus:'new',confirmed:true}),/changed/);
 assert.throws(()=>decideProfile(p,'approve',{expectedStatus:'reviewed',confirmed:false}),/Confirm/);
 assert.throws(()=>decideProfile({...p,consent:false},'approve',{expectedStatus:'reviewed',confirmed:true}),/consent/);
 assert.throws(()=>decideProfile({...p,email:'wrong'},'approve',{expectedStatus:'reviewed',confirmed:true}),/email/);
 for(const previous of ['new','approved','declined','suspended']){
  assert.throws(()=>decideProfile({...p,status:previous},'approve',{expectedStatus:previous,confirmed:true}));
 }
});
test('approval has held welcome email, decision history, and no false verification',()=>{
 const p=reviewed(),next=decideProfile(p,'approve',{expectedStatus:'reviewed',confirmed:true,at:'2026-11-22T02:00:00.000Z'});
 assert.equal(next.status,'approved');assert.equal(next.approvedAt,'2026-11-22T02:00:00.000Z');
 assert.deepEqual(next.welcomeNotice,{state:'held',createdAt:'2026-11-22T02:00:00.000Z'});
 assert.equal(next.internalBidNote,'DO_NOT_DISCLOSE');assert.notEqual(next.verification,'verified');
 assert.throws(()=>decideProfile(next,'approve',{expectedStatus:'approved',confirmed:true}));
});
test('declining records an internal status without scheduling any mail',()=>{
 const p=decideProfile(reviewed(),'decline',{expectedStatus:'reviewed',confirmed:true});
 assert.equal(p.status,'declined');assert.equal(p.welcomeNotice,undefined);
 assert.equal(p.decisionHistory.at(-1).to,'declined');
});
test('welcome message is safe, accurate, and not an award or certification',()=>{
 const m=welcomeEmail(reviewed());
 assert.equal(m.to,'contractor@example.org');
 assert.match(m.subject,/Welcome to the Tri-Point/);
 assert.match(m.text,/approved to participate/);
 assert.match(m.text,/not a subcontract/);
 assert.match(m.text,/not.*guarantee of work/);
 assert.doesNotMatch(m.text,/DO_NOT_DISCLOSE|referralCode|internalBidNote/);
 const injection=welcomeEmail({...reviewed(),company:'Sample\nBcc:bad@example.com'});
 assert.ok(!injection.text.includes('Sample\nBcc:'));
});
test('delivery defaults off, including preview even if all flags exist',()=>{
 const env={VERCEL_ENV:'production',TP_SUBCONTRACTOR_WELCOME_ENABLED:'true',TP_SUBCONTRACTOR_WELCOME_APPROVED:'true',TP_SUBCONTRACTOR_WELCOME_API_KEY:'synthetic-only',TP_SUBCONTRACTOR_WELCOME_FROM:'welcome@tripointgs.com'};
 assert.equal(welcomeEmailSettings({}).enabled,false);
 assert.equal(welcomeEmailSettings({...env,VERCEL_ENV:'preview'}).enabled,false);
 assert.equal(welcomeEmailSettings({...env,TP_SUBCONTRACTOR_WELCOME_APPROVED:'false'}).enabled,false);
 assert.equal(welcomeEmailSettings({...env,TP_SUBCONTRACTOR_WELCOME_FROM:'welcome@other.example'}).enabled,false);
 assert.equal(welcomeEmailSettings(env).enabled,true);
});
test('saved approval remains held without any email transport when disabled',async()=>{
 const s=store();await saveDecision(s,id,'approve',{expectedStatus:'reviewed',confirmed:true});
 let sends=0;
 assert.deepEqual(await dispatchWelcomeOnce(s,id,{env:{VERCEL_ENV:'production'},fetcher:async()=>{sends++}}),{state:'held',sent:false});
 assert.equal(sends,0);assert.equal(s.record.status,'approved');assert.equal(s.record.welcomeNotice.state,'held');
});
test('exactly one provider attempt follows durable claim; duplicate attempt is blocked',async()=>{
 const s=store();await saveDecision(s,id,'approve',{expectedStatus:'reviewed',confirmed:true});
 const env={VERCEL_ENV:'production',TP_SUBCONTRACTOR_WELCOME_ENABLED:'true',TP_SUBCONTRACTOR_WELCOME_APPROVED:'true',TP_SUBCONTRACTOR_WELCOME_API_KEY:'synthetic',TP_SUBCONTRACTOR_WELCOME_FROM:'welcome@tripointgs.com'};
 let sends=0,request;
 const result=await dispatchWelcomeOnce(s,id,{env,fetcher:async(url,init)=>{sends++;request={url,init};assert.equal(s.record.welcomeNotice.state,'attempted');return {ok:true,json:async()=>({id:'synthetic-resend-id'})}}});
 assert.equal(result.state,'provider-accepted');assert.equal(sends,1);
 assert.equal(s.record.welcomeNotice.providerId,'synthetic-resend-id');
 assert.deepEqual(JSON.parse(request.init.body).to,['contractor@example.org']);
 assert.equal(request.init.headers['Idempotency-Key'],'tp-network-welcome-'+id);
 assert.deepEqual(JSON.parse(request.init.body).reply_to,['info@tripointgs.com']);
 await assert.rejects(dispatchWelcomeOnce(s,id,{env,fetcher:async()=>{sends++}}),/not awaiting/);
 assert.equal(sends,1);
});
test('provider timeout is outcome-unknown and never automatically retried',async()=>{
 const s=store();await saveDecision(s,id,'approve',{expectedStatus:'reviewed',confirmed:true});
 const env={VERCEL_ENV:'production',TP_SUBCONTRACTOR_WELCOME_ENABLED:'true',TP_SUBCONTRACTOR_WELCOME_APPROVED:'true',TP_SUBCONTRACTOR_WELCOME_API_KEY:'synthetic',TP_SUBCONTRACTOR_WELCOME_FROM:'welcome@tripointgs.com'};
 let sends=0;
 const prior=console.error;console.error=()=>{};
 try{
  const first=await dispatchWelcomeOnce(s,id,{env,fetcher:async()=>{sends++;throw new Error('timeout')}});
  assert.equal(first.state,'outcome-unknown');assert.equal(s.record.welcomeNotice.state,'outcome-unknown');
  await assert.rejects(dispatchWelcomeOnce(s,id,{env,fetcher:async()=>{sends++}}),/not awaiting/);
  assert.equal(sends,1);
 }finally{console.error=prior}
});
test('store version conflict stops status update before any notice',async()=>{
 const s=store();
 await saveDecision(s,id,'approve',{expectedStatus:'reviewed',confirmed:true});
 await assert.rejects(saveDecision(s,id,'approve',{expectedStatus:'reviewed',confirmed:true}),/changed/);
 assert.equal(s.writes.length,1);
});

test('a failed durable claim readback prevents any external email request',async()=>{
 const s=store();await saveDecision(s,id,'approve',{expectedStatus:'reviewed',confirmed:true});
 const env={VERCEL_ENV:'production',TP_SUBCONTRACTOR_WELCOME_ENABLED:'true',TP_SUBCONTRACTOR_WELCOME_APPROVED:'true',TP_SUBCONTRACTOR_WELCOME_API_KEY:'synthetic',TP_SUBCONTRACTOR_WELCOME_FROM:'network@send.tripointgs.com'};
 let sends=0;
 const originalRead=s.readProfile;let reads=0;
 s.readProfile=async (...args)=>{
  const r=await originalRead(...args);
  if(++reads===2)r.record.welcomeNotice.state='held';
  return r;
 };
 await assert.rejects(dispatchWelcomeOnce(s,id,{env,fetcher:async()=>{sends++;return {ok:true,json:async()=>({id:'fake'})}}}),/could not be verified/);
 assert.equal(sends,0);
 assert.equal(s.record.welcomeNotice.state,'attempted');
});
