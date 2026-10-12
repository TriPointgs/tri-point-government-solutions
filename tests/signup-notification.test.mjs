import test from 'node:test';import assert from 'node:assert/strict';
import {notificationConfiguration,signupMessage,notifySignup} from '../lib/signup-notification.mjs';
import notifications from '../api/notifications.js';
import {sign} from '../lib/security.mjs';
process.env.TP_SESSION_SECRET='unit-test-secret-longer-than-thirty-two-characters';process.env.NODE_ENV='test';
test('email is disabled by default and never sends from preview',async()=>{
 let called=0;const env={VERCEL_ENV:'preview',TP_SIGNUP_EMAIL_ENABLED:'true',RESEND_API_KEY:'fake',TP_SIGNUP_EMAIL_FROM:'notify@tripointgs.com'};
 assert.equal(notificationConfiguration(env).enabled,false);
 const result=await notifySignup({company:'Synthetic'},'test-id',{env,fetcher:async()=>{called++;}});
 assert.equal(result.status,'disabled');assert.equal(called,0);
});
test('a missing sender does not activate email',()=>assert.equal(notificationConfiguration({VERCEL_ENV:'production'}).enabled,false));
test('email excludes internal opportunity intelligence',()=>{
 const m=signupMessage({company:'Example',trade:'janitorial',serviceCounties:['Lake'],crewSize:4,internalNotes:'PRIVATE_SOURCE'},'test-ref');
 assert.match(m.text,/Example/);assert.doesNotMatch(m.text,/PRIVATE_SOURCE|sam\\.gov|margins/);
});
test('test transport addresses one notification to company mailbox with idempotency',async()=>{
 const env={VERCEL_ENV:'production',TP_SIGNUP_EMAIL_ENABLED:'true',RESEND_API_KEY:'test',TP_SIGNUP_EMAIL_FROM:'notify@tripointgs.com'};
 let seen;await notifySignup({company:'Synthetic'},'synthetic-reference',{env,fetcher:async(url,init)=>{seen={url,init};return {ok:true,json:async()=>({id:'email-test'})};}});
 assert.match(seen.url,/resend.com/);assert.equal(seen.init.headers['Idempotency-Key'],'new-contractor-synthetic-reference');
 assert.deepEqual(JSON.parse(seen.init.body).to,['info@tripointgs.com']);
});
test('notification endpoint rejects anonymous callers',async()=>{
 let data;const res={setHeader:()=>{},end:v=>{data=JSON.parse(v);}};
 await notifications({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,401);assert.match(data.error,/sign in/i);
});
test('review mutation rejects forged origin',async()=>{
 let data;const res={setHeader:()=>{},end:v=>{data=JSON.parse(v);}};
 await notifications({method:'POST',headers:{cookie:'__Host-tp_admin='+sign({type:'admin',at:Date.now()}),origin:'https://evil.example'}},res);
 assert.equal(res.statusCode,403);
});
