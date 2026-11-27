import {HttpError} from './model.mjs';
import {catalogConfig,CATALOG_CATEGORIES} from './catalog-remote.mjs';
export function inventoryQuery(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['q','maker','category','cursor'].includes(k)))throw new HttpError(400,'Invalid catalog browse fields.');
 for(const key of ['q','maker','category','cursor'])if(value[key]!==undefined&&typeof value[key]!=='string')throw new HttpError(400,'Invalid catalog browse field type.');
 if(/[\x00-\x1f\x7f]/.test((value.q||'')+(value.maker||'')))throw new HttpError(400,'Invalid catalog browse request.');
 const q=String(value.q||'').trim(),maker=String(value.maker||'').trim(),category=String(value.category||'all').toLowerCase(),cursor=String(value.cursor||'');
 if(q.length>100||maker.length>80||/[\x00-\x1f\x7f]/.test(q+maker)||!CATALOG_CATEGORIES.includes(category)||cursor.length>400||(cursor&&!/^[A-Za-z0-9_-]+$/.test(cursor)))throw new HttpError(400,'Invalid catalog browse request.');
 return {q,maker,category,cursor};
}
export function sanitizeInventory(data){
 if(data?.capability!=='full-catalog-v1'||!Array.isArray(data.items)||data.items.length>50||!Number.isSafeInteger(data.totalRecords)||data.totalRecords<0||data.totalRecords>100000000||!Number.isSafeInteger(data.pageSize)||data.pageSize!==50||typeof data.snapshotKey!=='string'||!/^[a-f0-9]{24}$/.test(data.snapshotKey))throw new HttpError(502,'The full catalog response was not valid.');
 const more=data.hasMore===true,next=data.nextCursor;
 if(more&&(!next||typeof next!=='string'||!/^[A-Za-z0-9_-]{1,400}$/.test(next))||!more&&next!==null)throw new HttpError(502,'The catalog returned an invalid next page.');
 const text=(v,n)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n):'';
 return {items:data.items.map(i=>({mfgPart:text(i?.mfgPart,110),supplierSku:text(i?.supplierSku,110),distributorId:text(i?.distributorId,100),description:text(i?.description,500),manufacturer:text(i?.manufacturer,140),productFamily:text(i?.productFamily,130)})),hasMore:more,nextCursor:more?next:null,totalRecords:data.totalRecords,snapshotKey:data.snapshotKey,indexModifiedAt:Number.isFinite(Date.parse(data.indexModifiedAt))?data.indexModifiedAt:null,pageSize:50,categoryApproximate:data.categoryApproximate===true,capability:'full-catalog-v1',priceVerified:false,stockVerified:false};
}
export async function browsePrivateInventory(input,{env=process.env,fetcher=fetch}={}){
 const query=inventoryQuery(input),config=catalogConfig(env);if(!config)throw new HttpError(503,'The catalog connection needs to be configured by Tri-Point.');
 const u=new URL(config.url);u.pathname=u.pathname.replace(/\/$/,'')+'/browse';for(const [k,v]of Object.entries(query))if(v)u.searchParams.set(k,v);
 let response;try{response=await fetcher(u,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+config.token,Accept:'application/json'},signal:AbortSignal.timeout(12000)});}catch{throw new HttpError(502,'The catalog connection is temporarily unavailable.');}
 if(response.status===404||response.status===405){const e=new HttpError(503,'Full browsing needs the one-time catalog connector update. Keyword search remains available.');e.code='catalog_browse_upgrade_required';throw e;}
 if(response.status===409)throw new HttpError(409,'Catalog changed. Start again from the first page.');
 if(!response.ok)throw new HttpError(502,'The full catalog could not be read.');
 if(!/json/i.test(response.headers?.get?.('content-type')||'')||Number(response.headers?.get?.('content-length')||0)>180000)throw new HttpError(502,'Invalid catalog response size or format.');
 let raw;if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let bytes=0;try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>180000){await reader.cancel();throw new HttpError(502,'The full catalog response is too large.');}chunks.push(Buffer.from(value));}raw=Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}}
 else{raw=await response.text();if(Buffer.byteLength(raw)>180000)throw new HttpError(502,'The full catalog response is too large.');}
 let data;try{data=JSON.parse(raw);}catch{throw new HttpError(502,'The catalog response was unreadable.');}return sanitizeInventory(data);
}
