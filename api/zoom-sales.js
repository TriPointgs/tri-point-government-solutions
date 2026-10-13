import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,send,fail,equal} from '../lib/security.mjs';
import {createZoomService} from '../lib/zoom-service.mjs';
import {zoomPublicEnabled,ZOOM_CONTENT_VERSION} from '../lib/zoom-release.mjs';
import {zoomMailConfiguration,sendZoomTestAlert} from '../lib/zoom-mail.mjs';
import {limit} from '../lib/storage.mjs';
import {ZOOM_STATUSES,ZOOM_PRODUCTS,text} from '../lib/zoom-model.mjs';
function filters(q){const f={q:text(q.get('q'),'search',160),status:text(q.get('status'),'status',50),product:text(q.get('product'),'product',50),assignedTo:text(q.get('assignedTo'),'assignee',120),includeTests:q.get('includeTests')==='1',due:text(q.get('due'),'due filter',20)};if((f.status&&!ZOOM_STATUSES.includes(f.status))||(f.product&&!ZOOM_PRODUCTS.includes(f.product))||(f.due&&!['follow-up','renewal'].includes(f.due)))throw new HttpError(400,'Invalid sales filter.');return f;}
export function createZoomSalesHandler({service=createZoomService(),configuration=zoomMailConfiguration,testMailer=sendZoomTestAlert,rate=limit,env=process.env}={}){return async function handler(req,res){try{
 const q=new URL(req.url,'https://tripointgs.com').searchParams;
 if(q.get('job')==='reminders'){
  if(req.method!=='GET')throw new HttpError(405,'Method not allowed.');
  if(!env.CRON_SECRET||env.CRON_SECRET.length<32||!equal(req.headers.authorization,'Bearer '+env.CRON_SECRET))throw new HttpError(401,'Unauthorized scheduler.');
  return send(res,200,await service.reminderDigest());
 }
 requireAdmin(req);
 const c=configuration();
 if(req.method==='GET'){
  if(q.get('id'))return send(res,200,{lead:await service.get(q.get('id'))});
  if(q.get('export')==='csv'){
   const csv=await service.export(filters(q));res.statusCode=200;res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="tripoint-private-zoom-leads.csv"');return res.end(csv);
  }
  const offset=q.get('offset')||'0';if(!/^\d+$/.test(offset))throw new HttpError(400,'Invalid lead page.');
  const result=await service.list(filters(q),Number(offset));return send(res,200,{...result,configuration:{publicEnabled:zoomPublicEnabled(env),contentVersion:ZOOM_CONTENT_VERSION,emailEnabled:c.enabled,remindersEnabled:c.remindersEnabled,preview:c.preview}});
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
 requireOrigin(req);const b=await body(req,65536);
 if(b.action==='update')return send(res,200,{lead:await service.update(b.id,b.revision,b.changes)});
 if(b.action==='note')return send(res,200,{lead:await service.addNote(b.id,b.revision,b.note)});
 if(b.action==='retry-alert'&&b.confirm===true)return send(res,200,{lead:await service.retryAlert(b.id,b.revision)});
 if(b.action==='reconcile-alert'&&b.confirm===true)return send(res,200,{lead:await service.reconcileAlert(b.id,b.revision,b.accepted,b.evidence)});
 if(b.action==='test-alert'&&b.confirm===true){await rate(req,'zoom-test-alert',2);const receipt=await testMailer(b.requestId);return send(res,200,{status:'accepted',messageId:receipt.messageId});}
 if(b.action==='run-reminders'&&b.confirm===true)return send(res,200,await service.reminderDigest());
 throw new HttpError(400,'Unknown action or missing confirmation.');
 }catch(e){return fail(res,e);}};}
export default createZoomSalesHandler();
