// Signed test-mode Stripe snapshots only. The default is disabled. NEVER routes to TD.
import {createPaymentVerificationService} from '../lib/payment-verification-service.mjs';
import {stripeTestConfiguration} from '../lib/stripe-payment-verifier.mjs';
import {send} from '../lib/security.mjs';
import {HttpError} from '../lib/model.mjs';
export async function paymentRawBody(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'A signed JSON event is required.');
 if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')throw new HttpError(400,'Encoded payment bodies are not supported.');
 if(Number(req.headers['content-length']||0)>262144)throw new HttpError(413,'Payment event too large.');
 // Consume the original stream BEFORE touching any platform lazy JSON body getter.
 if(typeof req[Symbol.asyncIterator]==='function'){const parts=[];let size=0;for await(const part of req){const b=Buffer.from(part);size+=b.length;if(size>262144)throw new HttpError(413,'Payment event too large.');parts.push(b);}return Buffer.concat(parts);}
 const supplied=Object.getOwnPropertyDescriptor(req,'body');if(!supplied||supplied.get||(!Buffer.isBuffer(supplied.value)&&typeof supplied.value!=='string'))throw new HttpError(400,'Original payment-event bytes are required.');
 const b=Buffer.isBuffer(supplied.value)?supplied.value:Buffer.from(supplied.value);if(b.length>262144)throw new HttpError(413,'Payment event too large.');return b;

}
export function createPaymentEventsHandler({env=process.env,service=createPaymentVerificationService({env})}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{if(req.method!=='POST'){res.setHeader('Allow','POST');throw new HttpError(405,'Use a signed provider POST.');}
  if(!stripeTestConfiguration(env).configured)throw new HttpError(503,'Test payment verification is not enabled.');
  const raw=await paymentRawBody(req),result=await service.receive(raw,req.headers['stripe-signature']);return send(res,200,result);
 }catch(e){if(e.retryAfter)res.setHeader('Retry-After',String(Math.min(30,Math.max(1,e.retryAfter))));return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'Payment verification is temporarily unavailable. No supplier order was submitted.'});}
};}
// Vercel Web Standard handler: Request.body is the raw byte stream, without Node's
// automatic request.body JSON helper. The same bounded handler is exercised in tests.
export function createPaymentWebHandler(options){const handler=createPaymentEventsHandler(options);return async request=>{
 const req={method:request.method,headers:Object.fromEntries(request.headers),async *[Symbol.asyncIterator](){if(!request.body)return;const reader=request.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;yield value;}}finally{reader.releaseLock();}}};
 const headers=new Headers();let output='',status=500;const res={set statusCode(value){status=value;},get statusCode(){return status;},setHeader(k,v){headers.set(k,v);},end(v=''){output=v;}};
 await handler(req,res);return new Response(output,{status,headers});
};}
export default {fetch:createPaymentWebHandler()};
