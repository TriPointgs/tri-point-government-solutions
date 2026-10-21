// Private licensed-content cache. No original Icecat URL or token is persisted or returned.
import {createHash} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
export const CONTENT_CACHE_TTL_MS=6*60*60*1000;
const normal=v=>String(v||'').trim().toUpperCase();
export function contentCacheKey(identity,media,account){if(!['cover','gallery'].includes(media))throw new HttpError(400,'Invalid content mode.');return createHash('sha256').update(JSON.stringify([normal(identity.manufacturer),normal(identity.mfgPart),media,account])).digest('hex');}
export function safeContentSnapshot(result,identity,{at,ttl=CONTENT_CACHE_TTL_MS}={}){
 if(result?.status!=='matched'||result.identityVerified!==true||normal(result.product?.brand)!==normal(identity.manufacturer)||normal(result.product?.partNumber)!==normal(identity.mfgPart))return null;
 const text=(x,n)=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n):'';
 const safeImage=x=>typeof x==='string'&&x.length<=550000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x);
 const images=[...new Set((Array.isArray(result.images)?result.images:[result.imageData]).filter(safeImage))].slice(0,5);
 const p=result.product;return {schemaVersion:1,kind:'private-product-content',identity:{manufacturer:identity.manufacturer,mfgPart:identity.mfgPart},cachedAt:new Date(at).toISOString(),expiresAt:new Date(at+ttl).toISOString(),
  result:{status:'matched',identityVerified:true,publicationApproved:false,rightsReviewRequired:true,source:'Icecat Product JSON',checkedAt:result.checkedAt||new Date(at).toISOString(),message:images.length?'Exact product content matched · '+images.length+' photos':'Exact product content matched; no usable photo returned.',product:{brand:text(p.brand,140),partNumber:text(p.partNumber,130),title:text(p.title,260),description:text(p.description,2400),bullets:(Array.isArray(p.bullets)?p.bullets:[]).slice(0,12).map(x=>text(x,250)).filter(Boolean),specs:(Array.isArray(p.specs)?p.specs:[]).filter(x=>x&&typeof x==='object').slice(0,120).map(x=>({name:text(x.name,90),value:text(x.value,150)})).filter(x=>x.name&&x.value),hasImage:images.length>0},imageData:images[0]||null,images,galleryCount:images.length}};
}
export function createContentCacheStore({env=process.env,blob={get,put}}={}){
 const path=key=>{if(!/^[a-f0-9]{64}$/.test(key))throw new HttpError(400,'Invalid content cache key.');return 'preview/licensed-product-content/v1/'+key+'.json';};
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Content publication has not been released.');};
 return {async read(key){guard();try{const r=await blob.get(path(key),{access:'private',useCache:false});if(!r)return null;const raw=await new Response(r.stream).text();if(Buffer.byteLength(raw)>4000000)return null;return JSON.parse(raw);}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}},async write(key,data){guard();const raw=JSON.stringify(data);if(Buffer.byteLength(raw)>4000000)throw new HttpError(400,'Content exceeds cache limits.');await blob.put(path(key),raw,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});}};
}
export function memoryContentCache(){const rows=new Map();return {async read(key){return rows.has(key)?structuredClone(rows.get(key)):null;},async write(key,value){rows.set(key,structuredClone(value));}};}
export function createCachedContent({provider,env=process.env,store=createContentCacheStore({env}),clock=()=>Date.now()}={}){
 const inFlight=new Map(),account=createHash('sha256').update(String(env.TP_ICECAT_API_TOKEN||'')+'\0'+String(env.TP_ICECAT_CONTENT_TOKEN||'')).digest('hex');
 const read=async(identity,media)=>{try{const value=await store.read(contentCacheKey(identity,media,account));const created=Date.parse(value?.cachedAt),expires=Date.parse(value?.expiresAt);if(value?.schemaVersion!==1||value.kind!=='private-product-content'||!Number.isFinite(created)||!Number.isFinite(expires)||clock()>=Math.min(expires,created+CONTENT_CACHE_TTL_MS)||created>clock()+30000)return null;return safeContentSnapshot(value.result,identity,{at:Date.parse(value.cachedAt),ttl:Math.min(CONTENT_CACHE_TTL_MS,Date.parse(value.expiresAt)-Date.parse(value.cachedAt))})?.result||null;}catch{return null;}};
 const cachedRead=async(identity,media)=>{let cached=await read(identity,media);if(!cached&&media==='cover')cached=await read(identity,'gallery');if(cached&&media==='cover')cached={...cached,images:cached.images.slice(0,1),imageData:cached.images[0]||null,galleryCount:Math.min(1,cached.galleryCount)};return cached;};
 const invalidate=async identity=>{for(const mode of ['cover','gallery'])try{await store.write(contentCacheKey(identity,mode,account),{schemaVersion:1,kind:'invalidated',at:new Date(clock()).toISOString()});}catch{}};
 return {status:()=>({...provider.status(),persistentCache:'private-six-hour',publicImageHosting:false}),peek:cachedRead,
 async lookup(identity,{media='cover'}={}){
  if(env.VERCEL_ENV==='production')throw new HttpError(503,'Product content is not publicly released.');
  const cached=await cachedRead(identity,media);if(cached)return {...cached,cacheStatus:'hit'};
  const key=contentCacheKey(identity,media,account);if(inFlight.has(key))return inFlight.get(key);
  const request=(async()=>{let response;try{response=await provider.lookup(identity,{media});}catch(e){if(e.code==='icecat_access_denied')await invalidate(identity);throw e;}const snapshot=safeContentSnapshot(response,identity,{at:clock()});if(!snapshot){if(['account-or-brand-access-held','no-access-or-no-match','identity-mismatch'].includes(response?.status))await invalidate(identity);return response;}let saved=false;try{await store.write(key,snapshot);saved=true;}catch{/* usable content can be returned even if persistence is unavailable */}return {...snapshot.result,cacheStatus:saved?'stored':'not-stored'};})();
  inFlight.set(key,request);try{return await request;}finally{inFlight.delete(key);}
 }};
}
