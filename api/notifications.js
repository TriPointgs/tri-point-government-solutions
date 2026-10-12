import {HttpError} from '../lib/model.mjs';
import {requireAdmin,requireOrigin,body,send,fail} from '../lib/security.mjs';
import {opportunityStore} from '../lib/opportunity-storage.mjs';
import {notificationConfiguration} from '../lib/signup-notification.mjs';
const isNew=p=>p.status==='new'||!p.status;
async function summary(){
 let cursor=null,count=0,total=0,iterations=0;
 do{
  const page=await opportunityStore.pageProfiles(cursor);
  total+=page.records.length;count+=page.records.filter(isNew).length;
  if(total>5000||++iterations>250)throw new HttpError(503,'Directory exceeds notification scan limit.');
  cursor=page.hasMore?page.cursor:null;
 }while(cursor);
 return {newCount:count,totalCount:total,emailEnabled:notificationConfiguration().enabled};
}
export default async function handler(req,res){
 try{
  requireAdmin(req);
  if(req.method==='GET')return send(res,200,await summary());
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new HttpError(405,'Method not allowed.');}
  requireOrigin(req);
  const b=await body(req);
  if(b.action!=='mark-reviewed'||typeof b.id!=='string'||!/^[0-9a-f-]{36}$/.test(b.id))throw new HttpError(400,'Invalid application review request.');
  const {record,etag}=await opportunityStore.readProfile(b.id);
  if(isNew(record)){record.status='reviewed';record.reviewedAt=new Date().toISOString();await opportunityStore.saveProfile(record,etag);}
  return send(res,200,{ok:true,id:record.id,status:record.status});
 }catch(e){return fail(res,e);}
}
