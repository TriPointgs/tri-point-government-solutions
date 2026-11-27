import {createHash} from 'node:crypto';
import {HttpError} from './model.mjs';

const orderId=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const identityPart=value=>typeof value==='string'&&value.length>0&&value.length<=255&&value.trim()===value;
const unavailable=()=>new HttpError(503,'The marketplace account service is temporarily unavailable.');
const notFound=()=>new HttpError(404,'Order not found.');

export function marketplaceAccountKey({issuer,subject}){
 if(!identityPart(issuer)||!identityPart(subject))throw unavailable();
 return createHash('sha256').update(JSON.stringify(['marketplace-buyer-v1',issuer,subject])).digest('hex');
}

function summary(row){
 if(typeof row.id!=='string'||!orderId.test(row.id)||typeof row.reference!=='string'||
  typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
  !Number.isSafeInteger(row.totalCents)||row.totalCents<0||row.currency!=='USD'||typeof row.status!=='string')throw unavailable();
 return {id:row.id,reference:row.reference,createdAt:row.createdAt,totalCents:row.totalCents,currency:row.currency,status:row.status};
}

function itemProjection(item){
 if(typeof item?.title!=='string'||!Number.isSafeInteger(item.quantity)||item.quantity<1||
  !Number.isSafeInteger(item.unitPriceCents)||item.unitPriceCents<0)throw unavailable();
 return {title:item.title,quantity:item.quantity,unitPriceCents:item.unitPriceCents};
}

// The verifier must authenticate a dedicated buyer session server-side. The adapter
// owns issuer trust and session revocation. Browser fields and other roles grant no access.
export function createMarketplaceAccountAccess({verifyBuyer,orders}){
 async function checkoutIdentity(req){
  let verified;
  try{verified=await verifyBuyer(req);}catch{throw unavailable();}
  if(verified?.active!==true)throw new HttpError(401,'Sign in to a marketplace customer account.');
  if(verified.emailVerified!==true)throw new HttpError(403,'Verify your marketplace account email.');
  return {accountKey:marketplaceAccountKey(verified)};
 }
 return {
  checkoutIdentity,
  async history(req){
   const {accountKey}=await checkoutIdentity(req);
   let rows;
   try{rows=await orders.list(accountKey);}catch{throw unavailable();}
   if(!Array.isArray(rows)||rows.some(row=>row?.accountKey!==accountKey))throw unavailable();
   return rows.map(summary);
  },
  async order(req,id){
   const {accountKey}=await checkoutIdentity(req);
   if(typeof id!=='string'||!orderId.test(id))throw new HttpError(400,'Invalid order reference.');
   let row;
   try{row=await orders.read(accountKey,id);}catch{throw unavailable();}
   if(row?.accountKey!==accountKey||row.id!==id)throw notFound();
   if(!Array.isArray(row.items))throw unavailable();
   return {...summary(row),items:row.items.map(itemProjection)};
  }
 };
}