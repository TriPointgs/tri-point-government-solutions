import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogQuery,catalogConfig,sanitizeCatalog,searchPrivateCatalog} from '../lib/catalog-remote.mjs';
import {createCatalogHandler} from '../api/catalog.js';
import {catalogPage} from '../lib/catalog-page.mjs';
import {sign} from '../lib/security.mjs';
const key='synthetic-token-long-enough-for-tests-123456789';
const env={TP_CATALOG_API_URL:'https://catalog.example.org/private/',TP_CATALOG_API_TOKEN:key};
const res=()=>({statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(v=''){this.body=v;}});
test('queries validate input, bounded pagination, and empty search',()=>{
 assert.deepEqual(catalogQuery(new URLSearchParams('q=AP9513&maker=APC&page=2')),{q:'AP9513',maker:'APC',page:2});
 for(const x of ['q=x&page=1001','q='+ 'x'.repeat(101),'maker='+ 'x'.repeat(81)])assert.throws(()=>catalogQuery(new URLSearchParams(x)));
});
test('only private HTTPS backend configuration is accepted',()=>{
 assert.ok(catalogConfig(env));
 for(const url of ['http://catalog.example.org','https://localhost','https://name:pass@catalog.example.org','https://catalog.example.org:9000'])assert.equal(catalogConfig({...env,TP_CATALOG_API_URL:url}),null);
 assert.equal(catalogConfig({...env,TP_CATALOG_API_TOKEN:'short'}),null);
});
test('safe response strips unexpected fields and caps row count',()=>{
 const a=sanitizeCatalog({items:[{mfgPart:'AP9513',rawField13:97.02,internalSecret:'NO'}]});
 assert.equal(a.items[0].mfgPart,'AP9513');assert.equal(a.items[0].rawField13,97.02);assert.equal(a.items[0].internalSecret,undefined);assert.equal(a.priceVerified,false);
 assert.throws(()=>sanitizeCatalog({items:Array.from({length:51},()=>({}))}));
});
test('backend request sends bearer token server-side without exposing it',async()=>{
 const out=await searchPrivateCatalog({q:'AP9513',maker:'APC',page:0},{env,fetcher:async(u,opts)=>{
  assert.equal(opts.headers.Authorization,'Bearer '+key);assert.match(u.toString(),/q=AP9513/);
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({items:[{mfgPart:'AP9513',manufacturer:'APC',secret:'hidden'}],hasMore:false})};
 }});
 assert.equal(out.items[0].mfgPart,'AP9513');assert.equal(out.items[0].secret,undefined);
});
test('anonymous and contractor-only users cannot query catalog',async()=>{
 let queries=0;const handler=createCatalogHandler({search:async()=>{queries++;return {items:[]};}});
 let response=res();await handler({method:'GET',url:'/api/catalog?q=AP9513',headers:{}},response);assert.equal(response.statusCode,401);assert.equal(queries,0);
 response=res();await handler({method:'GET',url:'/api/catalog?q=AP9513',headers:{cookie:'__Host-tp_contractor=synthetic'}},response);assert.equal(response.statusCode,401);assert.equal(queries,0);
});
test('catalog UI requires admin before rendering content',async()=>{
 const handler=createCatalogHandler();const response=res();await handler({method:'GET',url:'/api/catalog?view=page',headers:{}},response);
 assert.equal(response.statusCode,303);assert.equal(response.headers.location,'/login');
 assert.match(catalogPage(),/noindex,nofollow/);
});
test('valid administrator cookie can access read-only search and page',async()=>{
 const prior=process.env.TP_SESSION_SECRET;
 process.env.TP_SESSION_SECRET='local-test-only-not-a-production-secret-for-catalog';
 try{
  const cookie='__Host-tp_admin='+sign({type:'admin',at:Date.now()});
  const request={method:'GET',url:'/api/catalog?q=AP9513',headers:{cookie}};
  const handler=createCatalogHandler({search:async()=>({items:[{mfgPart:'AP9513'}],hasMore:false})});
  const response=res();await handler(request,response);
  assert.equal(response.statusCode,200);assert.equal(JSON.parse(response.body).items[0].mfgPart,'AP9513');
  const page=res();await createCatalogHandler()({...request,url:'/api/catalog?view=page'},page);assert.equal(page.statusCode,200);assert.match(page.body,/Private.*Catalog/);
 }finally{if(prior===undefined)delete process.env.TP_SESSION_SECRET;else process.env.TP_SESSION_SECRET=prior;}
});
