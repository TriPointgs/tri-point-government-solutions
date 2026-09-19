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
const routes={'/api/admin':admin,'/api/intake':intake,'/api/opportunities':opportunities};const root=resolve('dist');
createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost:3000').pathname;
 res.setHeader('Cache-Control','private, no-store');
 if(routes[pathname])return routes[pathname](req,res);
 let filename=resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(root+'\\')&&!filename.startsWith(root+'/')){res.statusCode=403;return res.end();}
 if(!extname(filename))filename+='.html';
 try{const data=await readFile(filename);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[extname(filename)])||'text/plain');res.end(data);}catch{res.statusCode=404;res.end('Not found');}
}).listen(3000,'127.0.0.1',()=>console.log('Synthetic-only local preview: http://localhost:3000/contractors/admin/opportunities\nPreview password: synthetic-preview-admin-2026\nAll data is in memory. No Blob connection and no email delivery.'));
