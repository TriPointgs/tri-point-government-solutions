import {HttpError} from './model.mjs';
import {createHash} from 'node:crypto';
import {requireAdmin,requireOrigin,body,send} from './security.mjs';
import {limit} from './storage.mjs';
import {createCheckoutSetupService,setupAvailable} from './checkout-setup-store.mjs';
import {checkoutSetupPage} from './checkout-setup-page.mjs';
import {createDesktopTestPolicyService} from './desktop-test-policy.mjs';
import {marketplaceBuyerPolicy,MARKETPLACE_BUYER_ACCESS} from './marketplace-buyer-policy.mjs';
export function setupMissing(fields){const missing=[];for(const [key,label] of [['termsVersion','Terms version'],['termsText','Purchase / return / cancellation / warranty terms'],['shippingNotes','Customer shipping policy'],['taxNotes','Tax and exemption review notes']])if(!fields[key].trim())missing.push(label);if(fields.buyerAccess!==MARKETPLACE_BUYER_ACCESS)missing.push('Align saved draft with account-required checkout');if(!fields.products.length)missing.push('Exact product tax classifications');return missing;}
export function createCheckoutSetupHandler({env=process.env,service=createCheckoutSetupService({env}),configuration=async()=>({ready:false,blockers:['Runtime checkout status is unavailable.']}),desktopPolicy=createDesktopTestPolicyService({env,drafts:service}),rate=limit,clock=()=>Date.now()}={}){return async(req,res)=>{
 const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
 try{
  if(env.VERCEL_ENV!=='preview')throw new HttpError(503,'Checkout setup is restricted to private preview.');requireAdmin(req);
  if([...q.keys()].some(k=>k!=='view')||q.getAll('view').length!==1)throw new HttpError(400,'Invalid setup query.');
  if(view==='cart-checkout-setup-page'&&['GET','HEAD'].includes(req.method)){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':checkoutSetupPage());}
  if(view==='cart-checkout-setup-desktop-candidate'&&req.method==='GET'){
   await rate(req,'desktop-test-policy-read',20);
   return send(res,200,await desktopPolicy.candidate());
  }
  if(view==='cart-checkout-setup-desktop-status'&&req.method==='GET'){
   await rate(req,'desktop-test-policy-read',20);
   const policy=await desktopPolicy.readApproved();
   return send(res,200,{mode:'test',approved:!!policy,policyRevision:policy?.revision??null,
    expiresAt:policy?.expiresAt??null,checkoutActivated:false,liveCheckoutEnabled:false,supplierOrderingEnabled:false});
  }
  if(view==='cart-checkout-setup-desktop-approve'&&req.method==='POST'){
   requireOrigin(req);await rate(req,'desktop-test-policy-approve',5);
   const input=await body(req,2000);
   const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-tp_admin='));
   const actorFingerprint=createHash('sha256').update(cookie||'').digest('hex');
   return send(res,200,await desktopPolicy.approve(input,{actorFingerprint}));
  }
  if(req.method==='GET'&&view==='cart-checkout-setup-status'){
   await rate(req,'checkout-setup-read',20);const available=setupAvailable(env),draft=available?await service.read():null;let runtime;
   try{const c=await configuration();runtime={checked:true,testCheckoutReady:c.ready===true,historyReady:c.historyReady===true,blockers:Array.isArray(c.blockers)?c.blockers:[]};}catch{runtime={checked:false,testCheckoutReady:false,historyReady:false,blockers:['Runtime settings could not be checked. No approval is inferred.']};}
   return send(res,200,{checkedAt:new Date(clock()).toISOString(),storageAvailable:available,draft,buyerPolicy:marketplaceBuyerPolicy(),missing:draft?setupMissing(draft.fields):[],runtime,liveCheckoutEnabled:false,supplierOrderingEnabled:false});
  }
  if(req.method==='GET'&&view==='cart-checkout-setup-export'){
   await rate(req,'checkout-setup-export',10);const draft=await service.read();if(!draft.revision)throw new HttpError(409,'Save a draft before exporting its review packet.');
   res.setHeader('Content-Disposition','attachment; filename="tripoint-checkout-review-r'+draft.revision+'.json"');return send(res,200,{kind:'merchant-checkout-review-packet',generatedAt:new Date(clock()).toISOString(),...draft,buyerPolicy:marketplaceBuyerPolicy(),missing:setupMissing(draft.fields),notice:'DRAFT ONLY. Completeness is not approval. This packet cannot activate checkout, publish terms, validate tax classifications, or change shipping or buyer access.'});
  }
  if(req.method==='POST'&&view==='cart-checkout-setup-save'){
   requireOrigin(req);await rate(req,'checkout-setup-save',10);const input=await body(req,75000);return send(res,200,await service.save(input));
  }
  throw new HttpError(405,'Unsupported checkout setup action.');
 }catch(e){if(e.status===401&&view==='cart-checkout-setup-page'){res.statusCode=303;res.setHeader('Location','/login?next='+encodeURIComponent('/admin/checkout-setup'));return res.end();}return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'Setup is temporarily unavailable. No approved policy or activation flag was changed.'});}
};}
