import {applySiteExperience} from '../lib/site-experience.mjs';
import {requireAdmin} from '../lib/security.mjs';
import {quoteAccess} from '../lib/zoom-access.mjs';
import {renderZoomPage,renderZoomAdmin} from '../lib/zoom-pages.mjs';
import {zoomPublicEnabled} from '../lib/zoom-release.mjs';
export function createZoomPageHandler({publicEnabled=zoomPublicEnabled}={}){return async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');res.statusCode=405;return res.end('Method not allowed.');}
 try{
  const q=new URL(req.url,'https://tripointgs.com').searchParams,view=q.get('view')||'marketing';let html;
  if(view==='admin'){requireAdmin(req);html=renderZoomAdmin();}
  else if(['marketing','quote'].includes(view)){const access=quoteAccess(req,publicEnabled());html=renderZoomPage({review:access.review,formOnly:view==='quote'});if(!access.review&&view==='marketing')res.setHeader('X-Robots-Tag','index, follow');}
  else{res.statusCode=404;return res.end('Not found.');}
  res.statusCode=200;return res.end(req.method==='HEAD'?'':applySiteExperience(html,{route:view==='admin'?'/contractors/admin/zoom':'/solutions/zoom'}));
 }catch(e){
  if(e.status===401){res.statusCode=303;res.setHeader('Location','/login');return res.end();}
  res.statusCode=e.status||503;return res.end(req.method==='HEAD'?'':'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Page unavailable | Tri-Point</title></head><body><main><h1>This page is not available.</h1><p><a href="/">Return to Tri-Point</a></p></main></body></html>');
 }
};}
export default createZoomPageHandler();
