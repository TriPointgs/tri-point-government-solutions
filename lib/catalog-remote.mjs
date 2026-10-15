import {HttpError} from './model.mjs';

export const CATALOG_CATEGORIES=Object.freeze(['all','laptops','desktops','monitors','networking','software','accessories']);
export function catalogQuery(params){
 const q=(params.get('q')||'').trim(),maker=(params.get('maker')||'').trim(),p=params.get('page')||'0';
 const category=(params.get('category')||'all').trim().toLowerCase(),exact=params.get('exact')||'0';
 if(q.length>100||maker.length>80||/[\u0000-\u001f\u007f]/.test(q+maker)||!/^\d{1,4}$/.test(p)||Number(p)>1000)throw new HttpError(400,'Invalid catalog search input.');
 if(!CATALOG_CATEGORIES.includes(category)||!['0','1'].includes(exact)||(exact==='1'&&!q))throw new HttpError(400,'Invalid catalog filter.');
 return {q,maker,page:Number(p),category,exact:exact==='1'};
}
export function catalogConfig(env=process.env){
 if(!env.TP_CATALOG_API_TOKEN||env.TP_CATALOG_API_TOKEN.length<32||!env.TP_CATALOG_API_URL)return null;
 try{
  const url=new URL(env.TP_CATALOG_API_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!url.hostname.includes('.')||/\.(local|internal)$/.test(url.hostname)||!/^[a-zA-Z0-9/_-]*$/.test(url.pathname))return null;
  return {url,token:env.TP_CATALOG_API_TOKEN};
 }catch{return null;}
}
export function sanitizeCatalog(data,query={category:'all',exact:false}){
 if(((query.category||'all')!=='all'||query.exact===true)&&data?.filterVersion!==2)throw new HttpError(503,'The Windows catalog gateway needs the matching search update. Continue using All products until it is installed.');
 if(!data||!Array.isArray(data.items)||data.items.length>50)throw new HttpError(502,'Invalid private catalog response.');
 const s=(v,n)=>typeof v==='string'?v.slice(0,n):'';
 const n=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e12?v:null;
 return {items:data.items.map(i=>({
  manufacturer:s(i.manufacturer,140),description:s(i.description,500),mfgPart:s(i.mfgPart,110),supplierSku:s(i.supplierSku,110),distributorId:s(i.distributorId,100),productFamily:s(i.productFamily,130),
  rawField13:n(i.rawField13),rawField14:n(i.rawField14),rawField10:n(i.rawField10),rawField11:n(i.rawField11)
 })),hasMore:data.hasMore===true,priceVerified:false,stockVerified:false,
 snapshotDate:s(data.snapshotDate,40),totalRecords:Number.isSafeInteger(data.totalRecords)?data.totalRecords:null,
 filterVersion:data.filterVersion===2?2:1,category:data.filterVersion===2?s(data.category,30):'all',exact:data.filterVersion===2&&data.exact===true};
}
export async function searchPrivateCatalog(query,{env=process.env,fetcher=fetch}={}){
 const cfg=catalogConfig(env);
 if(!cfg)throw new HttpError(503,'Private catalog connection has not been configured.');
 const u=new URL(cfg.url);u.pathname=u.pathname.replace(/\/$/,'')+'/search';
 for(const k of ['q','maker','page'])u.searchParams.set(k,String(query[k]));
 u.searchParams.set('category',query.category||'all');
 u.searchParams.set('exact',query.exact?'1':'0');
 let response;
 try{response=await fetcher(u,{method:'GET',headers:{Authorization:'Bearer '+cfg.token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(9000)});}
 catch{throw new HttpError(502,'The private catalog service is temporarily unavailable.');}
 if(!response.ok)throw new HttpError(502,'The private catalog service did not return a result.');
 if(Number(response.headers?.get?.('content-length')||0)>128000)throw new HttpError(502,'Catalog response was too large.');
 let data;
 try{const body=await response.text();if(body.length>128000)throw Error('oversized');data=JSON.parse(body);}
 catch{throw new HttpError(502,'The private catalog returned invalid data.');}
 return sanitizeCatalog(data,query);
}
