import {get,head,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {UNREVIEWED_CART_COSTS,DEFAULT_SMART_POLICY,validateCartDefaults,validateSmartPolicy} from './smart-pricing-model.mjs';
const PREFIX='preview/smart-pricing/';
export function caseId(id){if(typeof id!=='string'||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/i.test(id)||!/^[0-9a-f-]{36}$/i.test(id))throw new HttpError(400,'Invalid scenario reference.');return id.toLowerCase();}
const initial=()=>({schemaVersion:1,mode:'preview',revision:0,policy:{...DEFAULT_SMART_POLICY},cartDefaults:{...UNREVIEWED_CART_COSTS},updatedAt:null});
function readableSettings(state){
 validateSmartPolicy(state.policy);
 // Older records did not validate cart defaults. A malformed record must not authorize pricing.
 try{return {...state,cartDefaults:validateCartDefaults(state.cartDefaults)};}
 catch(error){if(!(error instanceof HttpError))throw error;return {...state,cartDefaults:{...UNREVIEWED_CART_COSTS}};}
}
function writableSettings(state){
 if(state?.mode!=='preview')throw new HttpError(400,'Invalid pricing settings.');
 validateSmartPolicy(state.policy);
 const cartDefaults=state.cartDefaults===undefined?{...UNREVIEWED_CART_COSTS}:validateCartDefaults(state.cartDefaults);
 return {...state,cartDefaults};
}
export function createSmartStore({env=process.env,blob={get,head,put}}={}){
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Smart pricing is a private preview release.');};
 async function read(path,max=1200000){const r=await blob.get(path,{access:'private',useCache:false});if(!r)return null;const text=await new Response(r.stream).text();if(Buffer.byteLength(text)>max)throw new HttpError(503,'Scenario record exceeded its size limit.');return JSON.parse(text);}
 return {
  async settings(){guard();let before;try{before=await blob.head(PREFIX+'settings.json');}catch(e){if(e instanceof BlobNotFoundError)return {state:initial(),etag:null};throw e;}const state=await read(PREFIX+'settings.json',12000),after=await blob.head(PREFIX+'settings.json');if(!before.etag||before.etag!==after.etag)throw new HttpError(409,'Pricing settings changed. Refresh.');if(state?.schemaVersion!==1||state.mode!=='preview')throw new HttpError(503,'Unexpected pricing settings.');return {state:readableSettings(state),etag:after.etag};},
  async saveSettings(state,etag){guard();const record=writableSettings(state);try{await blob.put(PREFIX+'settings.json',JSON.stringify(record),{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}catch(e){if(/precondition|already.?exists/i.test((e.name||'')+' '+e.message))throw new HttpError(409,'Another session changed pricing settings. Refresh.');throw e;}},
  async readCase(id){guard();try{const r=await read(PREFIX+'cases/'+caseId(id)+'.json');if(r&&(r.schemaVersion!==1||r.mode!=='preview'||r.id!==id))throw new HttpError(503,'Unexpected scenario record.');return r;}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}},
  async createCase(record){guard();caseId(record.id);const raw=JSON.stringify(record);if(record.mode!=='preview'||Buffer.byteLength(raw)>1200000)throw new HttpError(400,'Invalid scenario record.');try{await blob.put(PREFIX+'cases/'+record.id+'.json',raw,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return {record,created:true};}catch(e){if(/already.?exists/i.test((e.name||'')+' '+e.message)){const prior=await this.readCase(record.id);if(prior?.requestHash===record.requestHash)return {record:prior,created:false};throw new HttpError(409,'Scenario reference is already used by different inputs.');}throw e;}}
 };
}
export function memorySmartStore(){let settings=initial();const cases=new Map();return {async settings(){return {state:structuredClone(settings),etag:settings.revision?String(settings.revision):null};},async saveSettings(s,e){if(e!==(settings.revision?String(settings.revision):null))throw new HttpError(409,'Settings changed.');settings=structuredClone(writableSettings(s));},async readCase(id){return cases.has(caseId(id))?structuredClone(cases.get(id)):null;},async createCase(r){const prior=cases.get(r.id);if(prior){if(prior.requestHash!==r.requestHash)throw new HttpError(409,'Different scenario.');return {record:structuredClone(prior),created:false};}cases.set(r.id,structuredClone(r));return {record:r,created:true};}};}
