import {HttpError} from '../lib/model.mjs';
import {requireAdmin,send,fail} from '../lib/security.mjs';
import {catalogQuery,searchPrivateCatalog} from '../lib/catalog-remote.mjs';
export function createCatalogHandler({search=searchPrivateCatalog}={}){
 return async function handler(req,res){
  try{
   requireAdmin(req); // Contractor cookies never authorize access to this data.
   if(req.method!=='GET'){res.setHeader('Allow','GET');throw new HttpError(405,'Method not allowed.');}
   const input=catalogQuery(new URL(req.url,'https://tripointgs.com').searchParams);
   if(!input.q&&!input.maker)return send(res,200,{items:[],hasMore:false,priceVerified:false,stockVerified:false});
   return send(res,200,await search(input));
  }catch(error){return fail(res,error);}
 };
}
export default createCatalogHandler();
