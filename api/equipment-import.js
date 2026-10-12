import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {syntheticImportReport} from '../lib/equipment-catalog-stage.mjs';

/**
 * Preview-only dry-run endpoint for internal synthetic catalog and stock CSVs.
 * No persistence, supplier requests, publishing, or customer contact.
 */
export default async function handler(req,res){
  try {
    requireAdmin(req);
    // A production deployment must not accidentally accept simulated feed imports.
    if(process.env.VERCEL_ENV==='production')throw new HttpError(404,'Import staging is unavailable.');
    if(req.method!=='POST'){
      res.setHeader('Allow','POST');
      throw new HttpError(405,'Method not allowed.');
    }
    requireOrigin(req);
    const input=await body(req,275000);
    if(input.action!=='dryRunSynthetic'||input.confirmSynthetic!==true){
      throw new HttpError(400,'Only explicitly confirmed synthetic dry runs are supported.');
    }
    if(typeof input.catalogCsv!=='string'||typeof input.stockCsv!=='string'){
      throw new HttpError(400,'Catalog and stock fixtures must be CSV text.');
    }
    const result=syntheticImportReport({
      catalogCsv:input.catalogCsv,stockCsv:input.stockCsv,
      receivedAt:new Date().toISOString(),mode:input.mode??'full'
    });
    return send(res,200,result);
  }catch(error){return fail(res,error);}
}
