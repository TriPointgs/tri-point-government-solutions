import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {estimateEquipmentQuote,matchEquipmentProducts} from '../lib/equipment-pricing.mjs';

/**
 * Authenticated staff-only equipment quote analysis.
 * No TD SYNNEX HTTP calls, catalog mutations, buyer contact, or order submission.
 * Inputs remain manual/unverified until source checks are integrated.
 */
export default async function handler(req,res){
  try{
    requireAdmin(req);
    if(req.method!=='POST'){
      res.setHeader('Allow','POST');
      throw new HttpError(405,'Method not allowed.');
    }
    requireOrigin(req);
    const input=await body(req,131072);
    if(input.action==='estimate'){
      const estimate=estimateEquipmentQuote(input.quote);
      return send(res,200,{estimate,status:'DRAFT_ESTIMATE_ONLY',sourceVerified:false,
        notice:'Staff-only estimate. Verify supplier cost, freight, stock, authorization, tax and buyer eligibility before approval.'});
    }
    if(input.action==='match'){
      const matches=matchEquipmentProducts(input.requirement,input.products);
      return send(res,200,{matches,status:'PRELIMINARY_MATCHES',sourceVerified:false,
        notice:'Matches are preliminary, not verified product availability or solicitation compliance.'});
    }
    throw new HttpError(400,'Unknown equipment analysis operation.');
  }catch(error){return fail(res,error);}
}
