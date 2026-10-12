import test from 'node:test';import assert from 'node:assert/strict';
import {authConfiguration,normalizeEmail,parseLoginToken,sendClaimEmail,sessionFromRequest,setContractorCookie,requireContractor} from '../lib/contractor-auth.mjs';
import {safeOwnProfile,updateOwnProfile} from '../api/contractor-profile.js';
import contractorAuth from '../api/contractor-auth.js';
import contractorProfile from '../api/contractor-profile.js';
import {sign} from '../lib/security.mjs';
process.env.TP_SESSION_SECRET='synthetic-test-secret-longer-than-thirty-two';process.env.NODE_ENV='test';
const profile=()=>({id:'11111111-1111-4111-8111-111111111111',company:'Synthetic Business',email:'contact@example.invalid',contact:'Contact',trade:'janitorial',phone:'111-222',zip:'34748',state:'FL',serviceCounties:['Lake'],crewSize:11,maxProject:100000,insured:'yes',licensed:'yes',workersComp:'yes',consent:true,verification:'verified',internalNotes:'PRIVATE STRATEGY',opportunityId:'PRIVATE OPP',status:'new'});
test('contractor magic link disabled unless all configured in production',()=>{
 assert.equal(authConfiguration({VERCEL_ENV:'preview',TP_CONTRACTOR_LOGIN_ENABLED:'true',RESEND_API_KEY:'fake',TP_AUTH_EMAIL_FROM:'login@tripointgs.com'}).enabled,false);
 assert.equal(authConfiguration({VERCEL_ENV:'production'}).enabled,false);
 assert.equal(authConfiguration({VERCEL_ENV:'production',TP_CONTRACTOR_LOGIN_ENABLED:'true',RESEND_API_KEY:'fake',TP_AUTH_EMAIL_FROM:'login@tripointgs.com'}).enabled,true);
});
test('email normalizes case; malformed email fails',()=>{assert.equal(normalizeEmail('  CONTACT@Example.COM '),'contact@example.com');assert.throws(()=>normalizeEmail('notanemail'));});
test('invalid, short, ambiguous, and extended login tokens fail validation',()=>{
 for(const t of ['', '11111111-1111-1111-1111-111111111111.abc','not-an-id.hello','11111111-1111-1111-1111-111111111111.'.concat('a'.repeat(43),'.extra')])assert.throws(()=>parseLoginToken(t));
});
test('admin session is never contractor permission',()=>{
 const admin=sign({type:'admin',at:Date.now()});
 assert.equal(sessionFromRequest({headers:{cookie:'__Host-tp_admin='+admin}}),null);
 assert.throws(()=>requireContractor({headers:{cookie:'__Host-tp_admin='+admin}}),/Sign in/);
});
test('contractor signed cookie cannot be forged into admin role',()=>{
 const res={setHeader:(k,v)=>res[k]=v};
 setContractorCookie(res,profile());
 assert.match(res['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
 const cookie=res['Set-Cookie'].split(';')[0],p=sessionFromRequest({headers:{cookie}});
 assert.equal(p.profileId,profile().id);
 assert.equal(p.type,'contractor');
});
test('contractor own-profile projection hides admin, verification history, internal projects',()=>{
 const x=safeOwnProfile(profile());
 assert.equal(x.company,'Synthetic Business');assert.equal(x.email,'contact@example.invalid');
 for(const k of ['internalNotes','opportunityId','status','verification','profileUpdateAudit'])assert.equal(x[k],undefined);
});
test('profile changes update declared values without changing internal verification fields',()=>{
 const before=profile();
 const {record,changes}=updateOwnProfile(before,{crewSize:16,serviceCounties:['Lake','Orange'],insured:'no'});
 assert.equal(changes,3);assert.equal(before.crewSize,11);
 assert.equal(record.crewSize,16);assert.deepEqual(record.serviceCounties,['Lake','Orange']);
 assert.equal(record.verification,'verified');assert.equal(record.internalNotes,'PRIVATE STRATEGY');
 assert.equal(record.needsReverification.crewSize,true);assert.equal(record.needsReverification.insured,true);
 assert.equal(record.profileUpdateAudit.length,3);
});
test('client cannot modify other records, email, status, internal notes or verification',()=>{
 for(const field of ['id','email','status','verification','internalNotes','opportunityId','company','profileUpdateAudit'])assert.throws(()=>updateOwnProfile(profile(),{[field]:'forged'}),/Only your own/);
});
test('change validation rejects invalid insurance, website or number',()=>{
 assert.throws(()=>updateOwnProfile(profile(),{insured:'verified'}));
 assert.throws(()=>updateOwnProfile(profile(),{website:'javascript:alert(1)'}));
 assert.throws(()=>updateOwnProfile(profile(),{crewSize:-3}));
});
test('email sender only sends to the profile email using fragment claim links',async()=>{
 const env={VERCEL_ENV:'production',TP_CONTRACTOR_LOGIN_ENABLED:'true',RESEND_API_KEY:'synthetic',TP_AUTH_EMAIL_FROM:'login@tripointgs.com'};
 let seen;await sendClaimEmail(profile(),'11111111-1111-4111-8111-111111111111.'+'a'.repeat(43),{env,fetcher:async(url,init)=>{seen=JSON.parse(init.body);return {ok:true};}});
 assert.deepEqual(seen.to,['contact@example.invalid']);assert.match(seen.text,/\/login#claim=/);assert.doesNotMatch(seen.text,/\/login\?claim=/);
});
test('contractor APIs return no profile data before feature and identity verification',async()=>{
 let out;const res={setHeader:()=>{},end:v=>out=JSON.parse(v)};
 await contractorProfile({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,503);assert.equal(out.profile,undefined);
 await contractorAuth({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,200);assert.equal(out.enabled,false);assert.equal(out.signedIn,false);
});


test('shared login page and profile shell do not expose private opportunity content',async()=>{
 const fs=await import('node:fs');
 const src=fs.readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(src,/staff-login/);assert.match(src,/contractor-login/);
 assert.match(src,/contractors\/account/);assert.match(src,/noindex:true,script:'login\.js'/);
 const profileShell=fs.readFileSync(new URL('../assets/contractor-account.js',import.meta.url),'utf8');
 assert.doesNotMatch(profileShell,/solicitationUrl|opportunity-matches|SAM\.gov/);
});
