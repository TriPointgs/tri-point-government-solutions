import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {syntheticImportReport,stageSyntheticCatalog,SYNTHETIC_CATALOG_FORMAT} from '../lib/equipment-catalog-stage.mjs';
import {planSyntheticCatalogUpdate} from '../lib/equipment-catalog-diff.mjs';

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
    const input=await body(req,420000);
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
    if(input.previousCatalogCsv!==undefined){
      if(typeof input.previousCatalogCsv!=='string'||!input.previousCatalogCsv.trim())
        throw new HttpError(400,'Previous synthetic catalog must be non-empty CSV text.');
      const currentAt=Date.now();
      const previous=stageSyntheticCatalog({
        format:SYNTHETIC_CATALOG_FORMAT,csv:input.previousCatalogCsv,
        receivedAt:new Date(currentAt-1000).toISOString()
      });
      const next=stageSyntheticCatalog({
        format:SYNTHETIC_CATALOG_FORMAT,csv:input.catalogCsv,
        receivedAt:new Date(currentAt).toISOString()
      });
      result.changeControl=planSyntheticCatalogUpdate(previous,next);
    }
    return send(res,200,result);
  }catch(error){return fail(res,error);}
}
