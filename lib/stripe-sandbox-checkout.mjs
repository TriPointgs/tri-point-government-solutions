// Isolated merchant-only Stripe connectivity test. NEVER a commercial order or TD release.
import Stripe from 'stripe';
import {createHash,randomUUID} from 'node:crypto';
import {get,put,BlobNotFoundError,BlobPreconditionFailedError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {createStripePaymentVerifier,stripeTestConfiguration,isVerifiedPaymentEvent,isVerifiedPayment} from './stripe-payment-verifier.mjs';
export const SANDBOX_FLOW='tp-sandbox-checkout-demo-v1';
export const SANDBOX_AMOUNT=2000;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validId=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
const problem=(message,status=400)=>{throw new HttpError(status,message);};
export function sandboxCheckoutConfiguration(env=process.env){return {
 enabled:env.VERCEL_ENV!=='production'&&env.TP_STRIPE_SANDBOX_CHECKOUT_ENABLED==='true'&&stripeTestConfiguration(env).configured,
 mode:'test',amountCents:SANDBOX_AMOUNT,currency:'USD',commercialCheckoutEnabled:false,supplierOrderingEnabled:false,
 purpose:'Fixed synthetic payment test; no goods, tax determination, shipping or customer order.'
};}
export function sandboxRunKey(account,id){if(!/^acct_[A-Za-z0-9]{4,100}$/.test(account||'')||!validId(id))problem('Invalid sandbox checkout reference.');return hash([account,'stripe-sandbox-only',id]);}
export function sandboxMetadata(id,digest){return {tp_flow:SANDBOX_FLOW,tp_order_id:id,tp_order_version:'1',tp_quote_digest:digest};}
export function createSandboxRunStore({env=process.env,blob={get,put}}={}){
 const guard=()=>{if(!sandboxCheckoutConfiguration(env).enabled)problem('Sandbox checkout testing is not enabled.',503);};
 const path=key=>{if(!/^[a-f0-9]{64}$/.test(key))problem('Invalid test record.');return 'preview/stripe-sandbox-demo/v1/'+key+'.json';};
 return {
  async read(key){guard();let r;try{r=await blob.get(path(key),{access:'private',useCache:false});}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}if(!r)return null;
   if(!r.stream||!r.blob?.etag)problem('Sandbox record version is unavailable.',503);
   const reader=r.stream.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>50000){await reader.cancel();problem('Sandbox record is too large.',503);}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
   const record=JSON.parse(Buffer.concat(parts).toString('utf8'));if(record.kind!==SANDBOX_FLOW||record.mode!=='test'||record.key!==key||!validId(record.id)||!validId(record.owner)||!Number.isSafeInteger(record.revision)||record.revision<1||record.amountCents!==SANDBOX_AMOUNT||!Array.isArray(record.events)||record.events.length>100)problem('Unexpected sandbox record.',503);
   return {record,etag:r.blob.etag};
  },
  async save(key,record,etag){guard();if(record.key!==key||record.kind!==SANDBOX_FLOW||record.mode!=='test'||record.amountCents!==SANDBOX_AMOUNT||record.events.length>100)problem('Invalid sandbox record.');const data=JSON.stringify(record);if(Buffer.byteLength(data)>50000)problem('Sandbox record is too large.');
   await blob.put(path(key),data,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false})});
  }
 };
}
export function memorySandboxRunStore(){const rows=new Map();let n=0;return {async read(k){return rows.has(k)?structuredClone(rows.get(k)):null;},async save(k,r,tag){if((rows.get(k)?.etag||null)!==tag)throw Error('etag_conflict');rows.set(k,{record:structuredClone(r),etag:String(++n)});}};}
export function sandboxRunView(record,{now=Date.now(),includeUrl=false}={}){
 const observed=Date.parse(record.verifiedAt),fresh=Number.isFinite(observed)&&observed<=now+30000&&now-observed<=60000;
 const expired=Date.parse(record.expiresAt)<=now;
 return {id:record.id,mode:'test',purpose:'connectivity-test-only',state:record.state,amountCents:SANDBOX_AMOUNT,currency:'USD',createdAt:record.createdAt,expiresAt:record.expiresAt,expired,
  capturedTestPaymentVerified:record.state==='captured'&&record.captured===true&&!record.riskHold,verificationCurrent:fresh,verifiedAt:record.verifiedAt||null,
  reasons:record.reasons||[],commercialOrderCreated:false,commercialOrderPaid:false,supplierOrderSubmitted:false,realSupplierDispatchAllowed:false,emailSent:false,
  ...(includeUrl&&record.url&&!expired&&record.state==='open'?{url:record.url}:{}),
  message:record.state==='captured'?'Captured sandbox payment verified. This is not a product order.':record.state==='needs-review'?'The payment needs review; nothing is approved for fulfillment.':record.state==='check-failed'?'The last verification failed at '+({account:'Stripe account check',session:'Stripe Checkout Session retrieval',session_match:'Stripe Checkout Session matching',link:'signed-event linkage',intent:'PaymentIntent/charge verification'}[record.failureStage]||'payment verification')+'. No payment approval was inferred. Do not start another payment.':expired?'This test session has expired.':'No captured sandbox payment has been verified.'};
}
export function createStripeSandboxCheckout({env=process.env,client=null,verifier=createStripePaymentVerifier({env}),store=createSandboxRunStore({env}),clock=()=>Date.now()}={}){
 const accountId=env.TP_STRIPE_TEST_ACCOUNT_ID;
 let sdk=client;
 const guard=()=>{if(!sandboxCheckoutConfiguration(env).enabled)problem('Sandbox checkout testing is not enabled.',503);};
 const stripe=()=>sdk||(sdk=new Stripe(env.TP_STRIPE_TEST_SECRET_KEY,{maxNetworkRetries:0,timeout:10000}));
 const origin=()=>{const host=env.VERCEL_BRANCH_URL||env.VERCEL_URL;if(!/^[a-z0-9.-]+\.vercel\.app$/.test(host||''))problem('The private preview return address is unavailable.',503);return 'https://'+host;};
 const read=async id=>{if(!validId(id))problem('Invalid test reference.');const result=await store.read(sandboxRunKey(accountId,id));if(!result)problem('Sandbox test not found.',404);return result;};
 const owned=async(owner,id)=>{if(!validId(owner))problem('Sign in to the sandbox test again.',401);const r=await read(id);if(r.record.owner!==owner)problem('Sandbox test not found.',404);return r;};
 async function account(){let a;try{a=await stripe().accounts.retrieve();}catch{problem('The Stripe sandbox account could not be verified.',503);}if(a?.id!==accountId)problem('Stripe sandbox account mismatch. No session was created.',503);}
 const checkSession=(session,record)=>{
  if(session?.object!=='checkout.session'||session.id!==record.sessionId||session.livemode!==false||session.mode!=='payment'||session.currency!=='usd'||session.amount_total!==SANDBOX_AMOUNT||session.client_reference_id!==record.id||session.metadata?.tp_flow!==SANDBOX_FLOW||session.metadata?.tp_order_id!==record.id||session.metadata?.tp_order_version!=='1'||session.metadata?.tp_quote_digest!==record.testDigest)problem('Stripe returned a mismatched sandbox session.',503);
 };
 async function inspect(record,event=null){
  const key=record.key;let latest=await read(record.id),token=null,claim=null;
  // Bounded optimistic retry only when a fresh origin read proves the record advanced.
  // Never overwrite a record on a mismatched ETag or infer payment from a browser return.
  for(let attempt=0;attempt<3;attempt++){
   if(event&&latest.record.events.some(e=>e.id===event.id))return {received:true,duplicate:true,...sandboxRunView(latest.record,{now:clock()})};
   if(latest.record.check?.state==='running'&&clock()-Date.parse(latest.record.check.startedAt)<60000)problem('Payment verification is already running. Retry shortly.',409);
   token=randomUUID();
   claim={...latest.record,revision:latest.record.revision+1,captured:false,state:'checking',riskHold:latest.record.riskHold||event?.riskHold===true,check:{state:'running',token,startedAt:new Date(clock()).toISOString()}};
   try{await store.save(key,claim,latest.etag);break;}catch(e){
    if(!(e instanceof BlobPreconditionFailedError)&&e?.message!=='etag_conflict'){
     console.warn('Sandbox verification record claim failed',{stage:'storage',kind:e?.name==='BlobError'?'blob':'storage'});
     problem('The sandbox verification record could not be updated. No payment approval was inferred; retry this same test.',503);
    }
    let current;try{current=await read(record.id);}catch{
     problem('The sandbox storage conflict could not be reconciled. No payment approval was inferred.',503);
    }
    if(current.etag===latest.etag||current.record.revision<=latest.record.revision){
     console.warn('Sandbox conditional-write conflict with unchanged origin record',{stage:'claim',freshRevisionAdvanced:false});
     problem('Sandbox storage version mismatch: an uncached read did not show another update. Verification cannot begin. Do not make another payment.',503);
    }
    if(attempt===2)problem('Multiple verification updates occurred. Check this same test after they finish.',409);
    latest=current;
   }
  }
  let failureStage='account',result={state:'check-failed',captured:false,reasons:['processor_recheck_failed'],verifiedAt:null};let failed=false;
  try{
   await account();failureStage='session';const session=await stripe().checkout.sessions.retrieve(record.sessionId,{expand:['payment_intent']});failureStage='session_match';checkSession(session,record);
   const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
   if(event){failureStage='link';const eventPi=await verifier.eventPaymentId(event);if(pi!==eventPi)problem('The signed payment event belongs to a different session.',409);}
   if(session.status==='expired')result={state:'expired',captured:false,reasons:['test_session_expired'],verifiedAt:new Date(clock()).toISOString()};
   else if(session.status!=='complete'||session.payment_status!=='paid')result={state:'open',captured:false,reasons:['payment_not_complete'],verifiedAt:new Date(clock()).toISOString()};
   else{
    if(!/^pi_[A-Za-z0-9]{4,150}$/.test(pi||''))problem('No matching sandbox payment reference.',503);
    // Connectivity evidence only: never create a payable business order or a supplier-release ledger entry.
    failureStage='intent';const proof=await verifier.verify({provider:'stripe',mode:'test',accountId,paymentId:pi,orderId:record.id,orderVersion:1,quoteDigest:record.testDigest,amountCents:SANDBOX_AMOUNT,currency:'USD'});
    const permitted=isVerifiedPayment(proof)&&proof.eligible===true&&proof.captured===true&&!claim.riskHold;
    result={state:permitted?'captured':'needs-review',captured:permitted,reasons:claim.riskHold?['adverse_payment_event_requires_review']:proof.reasons,verifiedAt:proof.checkedAt};
   }
  }catch(e){failed=true;result={...result,failureStage};console.warn('Sandbox Stripe recheck failed',{stage:failureStage,kind:e?.name==='HttpError'?'validation':'provider',status:Number.isInteger(e?.status)?e.status:null});}
  const current=await read(record.id);if(current.record.check?.token!==token)problem('A newer verification superseded this result.',409);
  const finished={...current.record,...result,revision:current.record.revision+1,check:{state:'idle'},completionToken:token};
  if(event&&!failed){if(finished.events.length>=100)problem('Test history needs review.',409);finished.events=[...finished.events,{id:event.id,type:event.type,at:new Date(clock()).toISOString()}];}
  try{await store.save(key,finished,current.etag);}catch{const recovered=await read(record.id);if(recovered.record.completionToken!==token)problem('Verification storage is uncertain. Retry this check.',503);}
  if(failed)problem('The current sandbox payment could not be verified. Retry; no supplier order was submitted.',503);
  return {received:true,...sandboxRunView(finished,{now:clock()})};
 }
 return {configuration:()=>sandboxCheckoutConfiguration(env),
  async start(owner,id,consent){guard();if(!validId(owner)||!validId(id)||consent!==true)problem('Acknowledge the sandbox-only notice before starting.');
   const key=sandboxRunKey(accountId,id);let saved=await store.read(key);
   if(saved){if(saved.record.owner!==owner)problem('Sandbox test not found.',404);if(saved.record.state!=='creating')return {...sandboxRunView(saved.record,{now:clock(),includeUrl:true}),duplicate:true};}
   else{
    const createdAt=new Date(clock()).toISOString(),testDigest=hash([SANDBOX_FLOW,accountId,id,SANDBOX_AMOUNT]);
    const record={kind:SANDBOX_FLOW,mode:'test',key,id,owner,revision:1,amountCents:SANDBOX_AMOUNT,testDigest,createdAt,expiresAt:new Date(clock()+3600000).toISOString(),state:'creating',events:[],check:{state:'idle'},captured:false,riskHold:false,returnOrigin:origin()};
    try{await store.save(key,record,null);}catch{const prior=await store.read(key);if(!prior||prior.record.owner!==owner)problem('Sandbox request could not be saved.',409);}
    saved=await store.read(key);if(!saved||saved.record.owner!==owner)problem('Sandbox request could not be confirmed.',503);
   }
   if(saved.record.state!=='creating')return {...sandboxRunView(saved.record,{now:clock(),includeUrl:true}),duplicate:true};
   if(clock()-Date.parse(saved.record.createdAt)>300000)problem('This unfinished test request needs review. Start a new test rather than replaying an old creation.',409);
   await account();const record=saved.record,metadata=sandboxMetadata(id,record.testDigest);
   const params={mode:'payment',ui_mode:'hosted_page',allowed_payment_method_types:['card'],automatic_tax:{enabled:false},customer_creation:'if_required',client_reference_id:id,
    line_items:[{price_data:{currency:'usd',unit_amount:SANDBOX_AMOUNT,product_data:{name:'Tri-Point SANDBOX TEST — no product or service'}},quantity:1}],
    metadata,payment_intent_data:{capture_method:'automatic',metadata},expires_at:Math.floor(Date.parse(record.expiresAt)/1000),
    success_url:record.returnOrigin+'/admin/stripe-return?run='+id,cancel_url:record.returnOrigin+'/admin/stripe-return?run='+id+'&canceled=1'};
   let session;try{session=await stripe().checkout.sessions.create(params,{idempotencyKey:'tp-sandbox-demo-'+key});}catch{problem('Stripe session creation is uncertain. Retry this same test reference; do not start another payment.',503);}
   if(!/^cs_test_[A-Za-z0-9]{6,255}$/.test(session?.id||''))problem('Invalid sandbox Session ID.',503);
   checkSession(session,{...record,sessionId:session.id});
   let u;try{u=new URL(session.url);}catch{problem('No valid Stripe payment URL was returned.',503);}
   if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com'||u.username||u.password||session.status!=='open'||session.payment_status!=='unpaid'||!Array.isArray(session.payment_method_types)||session.payment_method_types.length!==1||session.payment_method_types[0]!=='card')problem('The returned session is not the permitted card-only sandbox checkout.',503);
   const ready={...record,revision:record.revision+1,state:'open',sessionId:session.id,url:session.url};
   try{await store.save(key,ready,saved.etag);}catch{const recovered=await read(id);if(recovered.record.sessionId!==session.id)problem('Checkout save could not be confirmed. Retry the same reference.',503);return {...sandboxRunView(recovered.record,{now:clock(),includeUrl:true}),duplicate:true};}
   return sandboxRunView(ready,{now:clock(),includeUrl:true});
  },
  async status(owner,id){guard();const data=await owned(owner,id);return sandboxRunView(data.record,{now:clock(),includeUrl:true});},
  async check(owner,id){guard();const data=await owned(owner,id);if(!data.record.sessionId)problem('The test session has not been created.',409);await inspect(data.record);return sandboxRunView((await owned(owner,id)).record,{now:clock(),includeUrl:true});},
  async receive(event){guard();if(!isVerifiedPaymentEvent(event)||!validId(event.sandboxDemoId))problem('A signed sandbox event is required.',400);const saved=await store.read(sandboxRunKey(accountId,event.sandboxDemoId));if(!saved)return {received:true,matched:false,commercialOrderCreated:false,realSupplierDispatchAllowed:false};if(!saved.record.sessionId)problem('Sandbox Session creation is not yet reconciled. Retry this event.',409);return inspect(saved.record,event);}
 };
}
