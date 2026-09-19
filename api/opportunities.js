import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {opportunityStore} from '../lib/opportunity-storage.mjs';
import {createOpportunityService} from '../lib/opportunity-service.mjs';
import {deliveryConfiguration,deliverApprovedDraft} from '../lib/outreach-delivery.mjs';

export function createHandler(service){return async function handler(req,res){try{
 requireAdmin(req); // Every operation, including list, matching, import and drafts, authenticates before any read.
 if(req.method==='GET'){
  const q=new URL(req.url,'https://tripointgs.com').searchParams;
  return send(res,200,await service.get({id:q.get('id'),matches:q.get('matches')==='1',cursor:q.get('cursor')}));
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
 requireOrigin(req);return send(res,200,await service.mutate(await body(req,131072)));
 }catch(error){return fail(res,error);}};}
export default createHandler(createOpportunityService(opportunityStore,{configuration:deliveryConfiguration,send:deliverApprovedDraft}));
