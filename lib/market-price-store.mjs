import {get,head,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {validProductId} from './product-controls-model.mjs';
import {blankMarketBook,RETAILERS} from './market-price.mjs';
export function createMarketPriceStore({env=process.env,blob={get,head,put}}={}){
 const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Retail comparison remains preview-only.');};
 const path=id=>'preview/market-price-evidence/'+validProductId(id)+'.json';
 return {async read(product){guard();let before;try{before=await blob.head(path(product.id));}catch(e){if(e instanceof BlobNotFoundError)return {book:blankMarketBook(product),etag:null};throw e;}
  const r=await blob.get(path(product.id),{access:'private',useCache:false});if(!r)throw new HttpError(409,'Comparison changed. Refresh.');
  const raw=await new Response(r.stream).text();if(Buffer.byteLength(raw)>60000)throw new HttpError(503,'Unexpected comparison size.');
  const book=JSON.parse(raw),after=await blob.head(path(product.id));if(!before.etag||before.etag!==after.etag)throw new HttpError(409,'Comparison changed. Refresh.');
  if(book.schemaVersion!==1||book.mode!=='preview'||book.productId!==product.id||!Array.isArray(book.offers)||book.offers.length>RETAILERS.length)throw new HttpError(503,'Unexpected comparison record.');return {book,etag:after.etag};},
  async save(book,etag){guard();if(book.mode!=='preview'||book.offers.length>RETAILERS.length)throw new HttpError(400,'Invalid comparison book.');const raw=JSON.stringify(book);if(Buffer.byteLength(raw)>60000)throw new HttpError(400,'Comparison is too large.');
   try{await blob.put(path(book.productId),raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}catch(e){if(/precondition|already.?exists/i.test((e.name||'')+' '+e.message))throw new HttpError(409,'Another administrator changed the comparison. Refresh before saving.');throw e;}}
 };
}
export function memoryMarketPriceStore(){const books=new Map();return {async read(p){const b=books.get(p.id);return {book:b?structuredClone(b):blankMarketBook(p),etag:b?String(b.revision):null};},async save(b,etag){const old=books.get(b.productId);if(etag!==(old?String(old.revision):null))throw new HttpError(409,'Concurrent comparison update.');books.set(b.productId,structuredClone(b));}};}
