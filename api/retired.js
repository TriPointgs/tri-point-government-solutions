// Removed resource URLs never return the former sourcing or training content.
export default function handler(req,res){
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');res.statusCode=405;return res.end();}
 res.statusCode=410;if(req.method==='HEAD')return res.end();
 res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Resource no longer available | Tri-Point</title><link rel="stylesheet" href="/assets/network.css"></head><body><main class="wrap narrow"><section class="section"><h1>This resource is no longer available.</h1><p>The Tri-Point network is for subcontractor introductions. It does not provide a public contract search or training library.</p><a class="button" href="/contractors">Subcontractor network</a></section></main></body></html>');
}
