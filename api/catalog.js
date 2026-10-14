import {HttpError} from '../lib/model.mjs';
import {requireAdmin,send,fail} from '../lib/security.mjs';
import {catalogQuery,searchPrivateCatalog} from '../lib/catalog-remote.mjs';
import {catalogPage} from '../lib/catalog-page.mjs';
export function createCatalogHandler({search=searchPrivateCatalog,render=catalogPage}={}){
 return async function handler(req,res){
  const query=new URL(req.url,'https://tripointgs.com').searchParams;
  const page=query.get('view')==='page';
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
   requireAdmin(req); // Contractor-only sessions cannot access either view.
   if(page){
    if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');throw new HttpError(405,'Method not allowed.');}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=200;return res.end(req.method==='HEAD'?'':render());
   }
   if(req.method!=='GET'){res.setHeader('Allow','GET');throw new HttpError(405,'Method not allowed.');}
   const input=catalogQuery(query);
   if(!input.q&&!input.maker)return send(res,200,{items:[],hasMore:false,priceVerified:false,stockVerified:false});
   return send(res,200,await search(input));
  }catch(error){
   if(page&&error.status===401){res.statusCode=303;res.setHeader('Location','/login');return res.end();}
   return fail(res,error);
  }
 };
}
export default createCatalogHandler();
