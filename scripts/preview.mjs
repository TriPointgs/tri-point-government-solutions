import {registerHooks} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
if(process.env.VERCEL)throw Error('Synthetic preview may run only locally.');
process.env.NODE_ENV='test';process.env.VERCEL_ENV='preview';process.env.SITE_ORIGIN='http://localhost:3000';
process.env.TP_SESSION_SECRET='synthetic-local-preview-only-not-a-production-secret';
process.env.TP_ADMIN_PASSWORD='synthetic-preview-admin-2026';
delete process.env.TP_OUTREACH_ENABLED;delete process.env.RESEND_API_KEY;
registerHooks({resolve(specifier,context,next){return specifier==='@vercel/blob'?{url:new URL('./preview-blob.mjs',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const [{default:admin},{default:intake},{default:opportunities},{saveApplication},{validateApplication}]=await Promise.all([import('../api/admin.js'),import('../api/intake.js'),import('../api/opportunities.js'),import('../lib/storage.mjs'),import('../lib/model.mjs')]);
for(const [id,name,trade,crew]of [['11111111-1111-4111-8111-111111111111','SYNTHETIC Lake Cleaning','janitorial',20],['22222222-2222-4222-8222-222222222222','SYNTHETIC Orange Electric','electrical',3]])await saveApplication(id,validateApplication({company:name,contact:'Synthetic Contact',email:'synthetic@example.invalid',zip:'34748',state:'FL',trade,serviceCounties:['Lake'],crewSize:crew,maxProject:150000,insured:'yes',workersComp:'unknown',availability:'Confirm for each project',consent:true}));
const {default:notifications}=await import('../api/notifications.js');
const {default:contractorAuth}=await import('../api/contractor-auth.js');
const {default:contractorProfile}=await import('../api/contractor-profile.js');
const [{default:zoomPage},{default:zoomQuotes},{default:zoomSales}]=await Promise.all([import('../api/zoom-page.js'),import('../api/zoom-quotes.js'),import('../api/zoom-sales.js')]);
const {createCatalogHandler}=await import('../api/catalog.js');
const {createCommerceHandler}=await import('../api/commerce.js');
const {createOrderLabService,createMemoryOrderRepository}=await import('../lib/commerce-service.mjs');
const syntheticProducts=Array.from({length:55},(_,i)=>({manufacturer:'SYNTHETIC LENOVO',description:'SYNTHETIC ThinkPad notebook '+(i+1),mfgPart:'DEMO-TP-'+String(i+1).padStart(3,'0'),supplierSku:'DEMO-'+(i+1),distributorId:'DEMO-ID-'+(i+1),productFamily:'SYNTHETIC TPP',rawField13:null,rawField14:null,rawField10:null,rawField11:null}));
const catalog=createCatalogHandler({search:async(q)=>{let products=syntheticProducts.filter(p=>(!q.maker||p.manufacturer.toLowerCase().includes(q.maker.toLowerCase()))&&(!q.q||(q.exact?[p.mfgPart,p.supplierSku,p.distributorId].includes(q.q.toUpperCase()):[p.description,p.mfgPart].join(' ').toLowerCase().includes(q.q.toLowerCase())))&&['all','laptops'].includes(q.category));return {items:products.slice(q.page*50,q.page*50+50),hasMore:products.length>q.page*50+50,priceVerified:false,stockVerified:false,filterVersion:2,category:q.category,exact:q.exact,totalRecords:55};}});
const commerce=createCommerceHandler({env:{VERCEL_ENV:'preview'},service:createOrderLabService({repository:createMemoryOrderRepository()})});
const {default:contact}=await import('../api/contact.js');
const routes={'/api/contact':contact,'/api/catalog':catalog,'/api/commerce':commerce,'/api/zoom-page':zoomPage,'/api/zoom-quotes':zoomQuotes,'/api/zoom-sales':zoomSales,'/api/contractor-auth':contractorAuth,'/api/contractor-profile':contractorProfile,'/api/notifications':notifications,'/api/admin':admin,'/api/intake':intake,'/api/opportunities':opportunities};const root=resolve('dist');
createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost:3000').pathname;
 res.setHeader('Cache-Control','private, no-store');
 if(pathname==='/solutions/zoom'||pathname==='/solutions/zoom/quote'||pathname==='/contractors/admin/zoom'){const q=new URL(req.url,'http://localhost:3000').searchParams;q.set('view',pathname==='/contractors/admin/zoom'?'admin':pathname.endsWith('/quote')?'quote':'marketing');req.url='/api/zoom-page?'+q;return zoomPage(req,res);}
 if(pathname==='/admin/catalog'){req.url='/api/catalog?view=page';return catalog(req,res);}
 if(pathname==='/admin/inquiries'){req.url='/api/contact?view=admin-page';return contact(req,res);}
 if(pathname==='/admin/orders'){req.url='/api/commerce?view=page';return commerce(req,res);}
 if(pathname==='/learn'||pathname.startsWith('/learn/')||pathname==='/government-contracts'||pathname.startsWith('/government-contracts/')){res.statusCode=410;return res.end('Resource retired.');}
 if(routes[pathname])return routes[pathname](req,res);
 let filename=resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(root+'\\')&&!filename.startsWith(root+'/')){res.statusCode=403;return res.end();}
 if(!extname(filename))filename+='.html';
 try{const data=await readFile(filename);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json','.xml':'application/xml'}[extname(filename)])||'text/plain');res.end(data);}catch{res.statusCode=404;res.end('Not found');}
}).listen(3000,'127.0.0.1',()=>console.log('Synthetic-only local preview: http://localhost:3000/contractors/admin/opportunities\nPreview password: synthetic-preview-admin-2026\nAll data is in memory. No Blob connection and no email delivery.'));
