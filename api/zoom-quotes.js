import {randomUUID} from 'node:crypto';
import {HttpError} from '../lib/model.mjs';
import {sign,verify,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {limit} from '../lib/storage.mjs';
import {quoteAccess} from '../lib/zoom-access.mjs';
import {zoomPublicEnabled} from '../lib/zoom-release.mjs';
import {createZoomService} from '../lib/zoom-service.mjs';
export function createZoomQuoteHandler({service=createZoomService(),publicEnabled=zoomPublicEnabled,rate=limit,clock=()=>Date.now()}={}){return async function handler(req,res){try{
 const access=quoteAccess(req,publicEnabled());
 if(req.method==='GET'){
  await rate(req,'zoom-quote-challenge',20);
  return send(res,200,{challenge:sign({type:'zoom-quote',id:randomUUID(),at:clock(),review:access.review}),review:access.review});
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
 requireOrigin(req);const b=await body(req,16384);
 if(b.faxNumber)throw new HttpError(400,'Unable to accept this request.');
 const challenge=verify(b.challenge,'zoom-quote',2*3600000);
 if(!challenge||clock()-challenge.at<2000||challenge.review!==access.review)throw new HttpError(400,'This secure form expired or changed. Refresh it and try again.');
 await rate(req,'zoom-quote-submit',4);
 const receipt=await service.submit(b,challenge.id,{isTest:access.review});
 return send(res,receipt.created?201:200,{ok:true,id:receipt.id,isTest:receipt.isTest,message:receipt.isTest?'Private review test saved; no customer order or email was created.':'Request received. No quotation, price or purchase has been approved.'});
 }catch(e){return fail(res,e);}};}
export default createZoomQuoteHandler();
