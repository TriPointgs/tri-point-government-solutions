import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {stripeSandboxPage} from '../lib/stripe-sandbox-page.mjs';
const script=fs.readFileSync('assets/stripe-sandbox.js','utf8');
const sample=id=>({id,mode:'test',state:'open',amountCents:2000,capturedTestPaymentVerified:false,message:'Existing synthetic test',expired:false,marketplaceRecordUpdated:false});
async function browser({query='',stored=null,storageBlocked=false,respond}={}){
 const elements=new Map([...stripeSandboxPage().matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{value:'',checked:false,disabled:true,hidden:false,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},removeAttribute(key){delete this[key];}}]));
 const requests=[],store=new Map(stored?[['tp-stripe-sandbox-run',stored]]:[]),navigations=[];
 const context={document:{getElementById:id=>{assert.ok(elements.has(id),'Element exists: '+id);return elements.get(id);}},URL,URLSearchParams,Date,crypto:{randomUUID},location:{href:'https://synthetic.example/admin/stripe-checkout'+query,assign:u=>navigations.push(u)},history:{replaceState:()=>{}},sessionStorage:{getItem:k=>{if(storageBlocked)throw Error('blocked');return store.get(k)||null;},setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetch:async(url,options={})=>{const q=new URL(url,'https://synthetic.example').searchParams,input=options.body?JSON.parse(options.body):null;requests.push({q:Object.fromEntries(q),input});const data=respond?await respond(q,input):q.get('view')==='configuration'?{enabled:true}:sample(q.get('id'));return {status:data.status||200,ok:!data.status||data.status<400,json:async()=>data};}};
 vm.runInNewContext(script,context,{timeout:1000});
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,requests,navigations,async event(id,type){await elements.get(id).listeners[type]({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));}};
}
test('real sandbox client restores valid UUIDv4 from URL and enables existing-test actions',async()=>{
 const id=randomUUID(),b=await browser({query:'?run='+id});
 assert.equal(b.requests.filter(r=>r.q.view==='status').length,1);
 assert.equal(b.requests.find(r=>r.q.view==='status').q.id,id);
 assert.equal(b.elements.get('sandbox-check').disabled,false);
 assert.equal(b.elements.get('sandbox-probe').disabled,false);
 assert.equal(b.requests.filter(r=>r.input).length,0);
});
test('real sandbox client restores valid saved tab reference without a new payment',async()=>{
 const id=randomUUID(),b=await browser({stored:id});
 assert.equal(b.elements.get('sandbox-check').disabled,false);
 assert.equal(b.requests.find(r=>r.q.view==='status').q.id,id);
});
test('browser storage denial does not discard a valid URL test reference',async()=>{
 const id=randomUUID(),b=await browser({query:'?run='+id,storageBlocked:true});
 assert.equal(b.elements.get('sandbox-check').disabled,false);
});
test('duplicate and malformed URL references cannot select a sandbox test',async()=>{
 for(const query of ['?run=bad','?run='+randomUUID()+'&run='+randomUUID()]){
  const b=await browser({query});assert.equal(b.elements.get('sandbox-check').disabled,true);assert.equal(b.requests.filter(r=>r.q.view==='status').length,0);
 }
});
test('read-only confirmation updates the headline but never claims the sandbox record was saved',async()=>{
 const b=await browser({respond:(q,input)=>input?{readOnly:true,processorCaptureConfirmed:true,marketplaceRecordUpdated:false,message:'Stripe confirmed; record unchanged'}:{enabled:true}});
 b.elements.get('sandbox-payment-id').value='pi_SYNTHETIC123456';await b.event('sandbox-payment-id','input');
 assert.equal(b.elements.get('sandbox-recover-check').disabled,false);assert.equal(b.elements.get('sandbox-reconcile-check').disabled,true);
 await b.event('sandbox-recover','submit');
 assert.equal(b.elements.get('sandbox-result-title').textContent,'Stripe capture confirmed; record not saved');assert.equal(b.elements.get('sandbox-ledger').textContent,'Not updated by read-only check');
 assert.equal(b.elements.get('sandbox-payment-id').value,'pi_SYNTHETIC123456');assert.equal(b.requests.filter(r=>r.input?.action==='reconcile-payment').length,0);
});
test('explicit save action works without a browser run and clearly marks persisted sandbox evidence',async()=>{
 const b=await browser({respond:(q,input)=>input?{id:randomUUID(),readOnly:false,processorCaptureConfirmed:true,capturedTestPaymentVerified:true,sandboxRecordSaved:true,marketplaceRecordUpdated:true,message:'Saved synthetic record; no commercial order'}:{enabled:true}});
 b.elements.get('sandbox-payment-id').value='pi_SYNTHETIC123456';await b.event('sandbox-payment-id','input');
 await b.event('sandbox-reconcile-check','click');assert.equal(b.requests.filter(r=>r.input).length,0);
 b.elements.get('sandbox-save-consent').checked=true;await b.event('sandbox-save-consent','change');assert.equal(b.elements.get('sandbox-reconcile-check').disabled,false);
 await b.event('sandbox-reconcile-check','click');assert.equal(b.elements.get('sandbox-result-title').textContent,'Sandbox capture verified and saved');assert.equal(b.elements.get('sandbox-ledger').textContent,'Saved (sandbox only)');
 const posts=b.requests.filter(r=>r.input);assert.equal(posts.length,1);assert.deepEqual(posts[0].input,{action:'reconcile-payment',paymentId:'pi_SYNTHETIC123456',consent:true});
});
test('failed recovery write does not leave a current saved-success label visible',async()=>{
 const b=await browser({respond:(q,input)=>input?{status:503,error:'Synthetic save failed'}:{enabled:true}});
 b.elements.get('sandbox-payment-id').value='pi_SYNTHETIC123456';b.elements.get('sandbox-save-consent').checked=true;
 await b.event('sandbox-reconcile-check','click');assert.equal(b.elements.get('sandbox-ledger').textContent,'Save not confirmed');assert.equal(b.elements.get('sandbox-proof').textContent,'Latest verification not confirmed');
});
