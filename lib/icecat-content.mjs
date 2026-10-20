// Isolated administrator-only preview trial. No scheduled full-catalog requests.
// Product JSON https://live.icecat.biz/api is intentionally used only server-side.
import {HttpError} from './model.mjs';
const text=(v,n=300)=>typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
const cleanPart=s=>text(s,130).toUpperCase();
const sameBrand=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.trim().normalize('NFKC').toUpperCase()===b.trim().normalize('NFKC').toUpperCase()&&a.trim().length<=140&&b.trim().length<=140;
const issue=(message,status=502)=>{throw new HttpError(status,message);};
const mediaHosts=new Set(['images.icecat.biz','data.icecat.biz']);
export function selectIcecatImage(data){
 const gallery=Array.isArray(data?.Gallery)?data.Gallery:[];
 // Do not present a brand logo as a photograph of the exact product.
 const candidates=gallery.filter(i=>!/(?:brandlogo|packaging|featurelogo)/i.test(String(i?.Type||''))).sort((a,b)=>Number(a.No||99)-Number(b.No||99)).map(i=>i?.LowPic||i?.Pic500x500);
 for(const raw of candidates){
  if(typeof raw!=='string'||raw.length>2048||/[\x00-\x20\x7f]/.test(raw))continue;
  try{const u=new URL(raw);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&mediaHosts.has(u.hostname.toLowerCase())&&u.pathname.length>2)return raw;}catch{}
 }
 return null;
}
export function normalizeIcecatContent(body,identity){
 if(body?.msg!=='OK'||!body.data||!body.data.GeneralInfo){const code=Number(body?.StatusCode??body?.statusCode);const restriction=[3,9,12,14,15,18,19].includes(code);return {status:restriction?'account-or-brand-access-held':'no-access-or-no-match',message:restriction?'Icecat account, brand or publication entitlement is not available for this product. Verify Channel Partner and brand permissions.':'Icecat did not return an accessible product data sheet.',product:null};}
 const data=body.data,g=data.GeneralInfo;
 if(cleanPart(g.BrandPartCode)!==cleanPart(identity.mfgPart)||!sameBrand(g.Brand,identity.manufacturer)){
  return {status:'identity-mismatch',message:'Icecat returned a different product. No content was used.',product:null};
 }
 const specs=[];
 for(const group of Array.isArray(data.FeaturesGroups)?data.FeaturesGroups.slice(0,12):[]){
  for(const f of Array.isArray(group.Features)?group.Features.slice(0,12):[]){
   const name=text(f?.Feature?.Name?.Value,90),val=text(f?.PresentationValue||f?.Value,150);
   if(name&&val&&specs.length<20)specs.push({name,value:val});
  }
 }
 const image=selectIcecatImage(data);
 const general=g.Description||{},bullet=data.GeneralInfo.BulletPoints||{};
 const description=text(general.LongDesc||data.GeneralInfo.SummaryDescription?.ShortSummaryDescription||'',900);
 const bullets=Array.isArray(bullet.Values)?bullet.Values.slice(0,8).map(v=>text(v,170)).filter(Boolean):[];
 return {status:'matched',message:image?'Exact product found; image preview is available.':'Exact product found; no eligible product image was returned.',product:{
  brand:text(g.Brand,140),partNumber:text(g.BrandPartCode,130),icecatId:Number.isSafeInteger(g.IcecatId)?g.IcecatId:null,title:text(g.Title,260),
  description,bullets,specs,hasImage:!!image},privateImageLink:image};
}
export async function readLimited(response,max=800000){
 if(!/json/i.test(response.headers?.get?.('content-type')||''))issue('Icecat returned an unsupported response.');
 if(Number(response.headers?.get?.('content-length')||0)>max)issue('Icecat response exceeds the permitted trial size.');
 let raw='';if(response.body?.getReader){const r=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await r.read();if(done)break;size+=value.byteLength;if(size>max){await r.cancel();issue('Icecat response is too large.');}chunks.push(Buffer.from(value));}}finally{r.releaseLock();}raw=Buffer.concat(chunks).toString('utf8');}else{raw=await response.text();if(Buffer.byteLength(raw)>max)issue('Icecat response is too large.');}
 try{return JSON.parse(raw);}catch{issue('Icecat returned unreadable JSON.');}
}
async function safeImage(response){
 if(!response.ok)return null;
 const t=(response.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!['image/jpeg','image/png','image/webp'].includes(t))return null;
 const n=Number(response.headers?.get?.('content-length')||0);if(n>220000)return null;
 let bytes=new Uint8Array();
 if(response.body?.getReader){const r=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await r.read();if(done)break;size+=value.byteLength;if(size>220000){await r.cancel();return null;}chunks.push(Buffer.from(value));}}finally{r.releaseLock();}bytes=Buffer.concat(chunks);}else{const b=await response.arrayBuffer();if(b.byteLength>220000)return null;bytes=new Uint8Array(b);}
 const jpg=t==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=t==='image/png'&&Buffer.from(bytes.subarray(0,8)).toString('hex')==='89504e470d0a1a0a';
 const webp=t==='image/webp'&&Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP';
 if(!jpg&&!png&&!webp)return null;
 return 'data:'+t+';base64,'+Buffer.from(bytes).toString('base64');
}
export function createIcecatContent({env=process.env,fetcher=fetch}={}){
 const status=()=>({configured:!!(env.TP_ICECAT_API_TOKEN&&env.TP_ICECAT_CONTENT_TOKEN),previewOnly:true,automaticMassEnrichment:false,mediaPublicationApproved:false});
 return {status,async lookup(identity){
  if(env.VERCEL_ENV==='production')issue('Icecat product enrichment is not enabled in production.',503);
  if(!status().configured)issue('Icecat credentials are missing from this preview branch.',503);
  if(typeof identity?.manufacturer!=='string'||identity.manufacturer.length>140||!identity.manufacturer.trim()||typeof identity.mfgPart!=='string'||!/^[-a-z0-9._#/+ ]{2,110}$/i.test(identity.mfgPart))issue('Invalid saved product identity.',400);
  const u=new URL('https://live.icecat.biz/api');u.searchParams.set('lang','EN');u.searchParams.set('Brand',identity.manufacturer);u.searchParams.set('ProductCode',identity.mfgPart);u.searchParams.set('content','generalinfo,image,gallery,featuregroups');
  let res;
  try{res=await fetcher(u.href,{method:'GET',redirect:'error',cache:'no-store',headers:{'api-token':env.TP_ICECAT_API_TOKEN,'content-token':env.TP_ICECAT_CONTENT_TOKEN,Accept:'application/json'},signal:AbortSignal.timeout(12000)});}catch{issue('Could not connect to Icecat.');}
  if(res.status===401||res.status===403)issue('Icecat rejected the account credentials or access rights.',502);
  if(res.status===429)issue('Icecat request quota was reached. Try again later.',429);
  if(!res.ok){if(res.status===404)return {status:'no-access-or-no-match',message:'No accessible Icecat data sheet for this exact part.',product:null,imageData:null,checkedAt:new Date().toISOString()};issue('Icecat product lookup failed.');}
  const parsed=normalizeIcecatContent(await readLimited(res),identity);
  if(parsed.status!=='matched')return {...parsed,imageData:null,checkedAt:new Date().toISOString()};
  let imageData=null;
  if(parsed.privateImageLink){try{const imageResponse=await fetcher(parsed.privateImageLink,{method:'GET',redirect:'error',cache:'no-store',headers:{Accept:'image/jpeg, image/png, image/webp'},signal:AbortSignal.timeout(9000)});imageData=await safeImage(imageResponse);}catch{/* no image is safer than a guessed one */}}
  return {status:parsed.status,message:parsed.message,product:parsed.product,imageData,checkedAt:new Date().toISOString(),source:'Icecat Product JSON',identityVerified:true,publicationApproved:false,rightsReviewRequired:true};
 }};
}
