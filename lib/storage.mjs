import {put,get,list,del} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {digest} from './security.mjs';
export const namespace=()=>process.env.VERCEL_ENV==='production'?'production':'preview';
const path=x=>`${namespace()}/${x}`;
const exists=e=>/already.?exists/i.test(e?.name||'')||/already exists/i.test(e?.message||'');
export async function readJson(name){const result=await get(name,{access:'private',useCache:false});if(!result)return null;return new Response(result.stream).json();}
export async function limit(req,action,max=3){
 const bucket=Math.floor(Date.now()/900000),ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
 const key=digest(`${bucket}:${action}:${ip}`).slice(0,32);
 for(let i=0;i<max;i++){try{await put(path(`rate/${bucket}/${key}-${i}.json`),'{}',{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return;}catch(e){if(!exists(e))throw e;}}
 throw new HttpError(429,'Too many attempts. Please try again in 15 minutes or contact info@tripointgs.com.');
}
export async function saveApplication(id,p){
 const record={...p,id,submittedAt:new Date().toISOString(),status:'new',referralCode:digest('referral:'+id).slice(0,18)};
 try{await put(path(`applications/${id}.json`),JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});}catch(e){if(!exists(e))throw e;}
 return {id,referralCode:record.referralCode};
}
export async function applicationPage(cursor){
 const result=await list({prefix:path('applications/'),limit:25,...(cursor?{cursor}:{})});const records=[];
 for(let i=0;i<result.blobs.length;i+=5){const batch=await Promise.all(result.blobs.slice(i,i+5).map(b=>readJson(b.url)));records.push(...batch.filter(Boolean));}
 return {records,cursor:result.hasMore?result.cursor:null,hasMore:result.hasMore};
}
export async function deleteApplication(id){if(!/^[0-9a-f-]{36}$/.test(id))throw new HttpError(400,'Invalid application ID.');await del(path(`applications/${id}.json`));}
