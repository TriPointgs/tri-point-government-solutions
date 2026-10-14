import {BUSINESS_ADDRESS_HTML,BUSINESS_POSTAL_ADDRESS} from './business-address.mjs';
export const ORIGIN='https://tripointgs.com';
export const FEED='/blog/feed.xml';
const COMPANY='Tri-Point Government Solutions LLC';
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export const xmlEscape=esc;
function text(value,n){return typeof value==='string'&&value.trim()&&value.length<=n&&!/[\u0000-\u001f\u007f]/.test(value);}
function utc(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().replace('.000','')===value;}
export function validatePost(post){
 if(!post||typeof post!=='object'||Array.isArray(post))throw Error('Invalid article');
 const fields=['slug','title','summary','category','status','approvedBy','approvedAt','publishedAt','body'];
 if(Object.keys(post).some(k=>!fields.includes(k)))throw Error('Unexpected article field');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug||'')||post.slug.length>100)throw Error('Invalid slug');
 for(const [k,n] of [['title',140],['summary',350],['category',80]])if(!text(post[k],n))throw Error('Invalid '+k);
 if(!['draft','approved'].includes(post.status))throw Error('Invalid status');
 if(!Array.isArray(post.body)||!post.body.length||post.body.length>35)throw Error('Invalid body');
 const body=post.body.map(b=>{
  if(!b||typeof b!=='object')throw Error('Invalid block');
  if(['paragraph','heading'].includes(b.type)&&Object.keys(b).every(k=>['type','text'].includes(k))&&text(b.text,1600))return {type:b.type,text:b.text.trim()};
  if(b.type==='list'&&Object.keys(b).every(k=>['type','items'].includes(k))&&Array.isArray(b.items)&&b.items.length&&b.items.length<=15&&b.items.every(i=>text(i,500)))return {type:b.type,items:b.items.map(i=>i.trim())};
  throw Error('Unsupported blog block');
 });
 if(post.status==='draft'){
  if(post.approvedBy||post.approvedAt||post.publishedAt)throw Error('Draft cannot claim approval');
 }else if(!text(post.approvedBy,120)||!utc(post.approvedAt)||!utc(post.publishedAt)||post.publishedAt<post.approvedAt)throw Error('Approved article needs signed-off dates');
 return {...post,body};
}
export function approvedPosts(records){
 const seen=new Set(),approved=[];
 for(const input of records){const p=validatePost(input);if(seen.has(p.slug))throw Error('Duplicate slug');seen.add(p.slug);if(p.status==='approved')approved.push(p);}
 return approved.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||a.slug.localeCompare(b.slug));
}
const header='<a class="skip" href="#main">Skip to content</a><header class="site-header"><nav class="nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/tripoint-logo.svg" width="260" height="70" alt="Tri-Point Government Solutions"></a><div class="nav-links"><a href="/">Agency capabilities</a><a href="/blog">Insights</a><a href="/contractors">Subcontractor network</a><a href="/login">Sign in</a></div></nav></header>';
const footer=`<footer><div class="wrap"><strong>${COMPANY}</strong><p><strong>Business address:</strong></p>${BUSINESS_ADDRESS_HTML}<p>Independent procurement and sourcing business. Not a government agency.</p><div class="footer-links"><a href="/">Home</a><a href="/blog">Procurement Insights</a><a href="/contractors">Subcontractor network</a><a href="mailto:info@tripointgs.com">info@tripointgs.com</a></div><p>&copy; 2026 Tri-Point Government Solutions LLC.</p></div></footer>`;
function page(title,description,route,body,{preview=false,schema=null}={}){
 const organization={'@type':'Organization',name:COMPANY,url:ORIGIN,logo:ORIGIN+'/assets/tripoint-logo.svg',address:BUSINESS_POSTAL_ADDRESS};
 const graph={'@context':'https://schema.org','@graph':[organization,schema||{'@type':'CollectionPage',name:title,description,url:ORIGIN+route}]};
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Tri-Point Government Solutions</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${preview?'noindex, nofollow':'index, follow'}"><link rel="canonical" href="${ORIGIN+route}"><link rel="alternate" type="application/rss+xml" title="Tri-Point Procurement Insights" href="${FEED}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="${schema?'article':'website'}"><meta property="og:url" content="${ORIGIN+route}"><link rel="icon" href="/assets/tripoint-logo.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/network.css"><link rel="stylesheet" href="/assets/blog.css"><script type="application/ld+json">${JSON.stringify(graph).replaceAll('<','\\u003c')}</script></head><body>${header}<main id="main" class="wrap">${body}</main>${footer}</body></html>`;
}
export function blogIndex(posts,{preview=false}={}){
 const cards=posts.length?posts.map(p=>`<article class="card blog-card"><p class="eyebrow">${esc(p.category)}</p><h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2><p>${esc(p.summary)}</p><p class="fine">Published ${esc(new Date(p.publishedAt).toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'}))}</p></article>`).join(''):'<div class="panel blog-empty"><h2>Articles are being prepared</h2><p>Tri-Point reviews each article before publication. Contact our team for current purchasing requirements or a quotation discussion.</p></div>';
 const body=`<section class="hero blog-hero"><div><p class="eyebrow">Tri-Point Government Solutions LLC · Knowledge center</p><h1>Procurement Insights</h1><p class="lead">Practical guidance for government, education and business buyers planning technology procurement, software renewals and institutional purchasing.</p><div class="actions"><a class="button" href="#articles">Explore articles</a><a class="button secondary" href="mailto:info@tripointgs.com?subject=Procurement%20Inquiry">Discuss a requirement</a></div><p class="fine">Original content reviewed by Tri-Point. Procurement requirements and availability vary by solicitation.</p></div><aside class="panel accent"><p class="eyebrow">Topics</p><h2>Buying decisions, clearly explained.</h2><p>IT hardware planning, licensing renewals, RFQ preparation, and supplier coordination.</p><a href="${FEED}" type="application/rss+xml">Subscribe via RSS</a></aside></section><section class="section" id="articles"><div class="section-title"><h2>Latest articles</h2><p>Only approved articles are displayed.</p></div><div class="blog-list">${cards}</div></section><section class="section"><div class="callout"><h2>Have an upcoming procurement requirement?</h2><p>Share your product specifications, quantity, delivery destination and quotation deadline.</p><a class="button" href="mailto:info@tripointgs.com?subject=Procurement%20Requirement">Contact Tri-Point</a></div></section>`;
 return page('Procurement Insights','Buying guidance and educational resources from Tri-Point Government Solutions.', '/blog',body,{preview});
}
const block=b=>b.type==='paragraph'?`<p>${esc(b.text)}</p>`:b.type==='heading'?`<h2>${esc(b.text)}</h2>`:'<ul>'+b.items.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';
export function blogArticle(post,{preview=false}={}){
 if(post.status!=='approved')throw Error('Draft cannot be made public');
 const route='/blog/'+post.slug;const schema={'@type':'BlogPosting',headline:post.title,description:post.summary,datePublished:post.publishedAt,dateModified:post.publishedAt,mainEntityOfPage:ORIGIN+route,articleSection:post.category,author:{'@type':'Organization',name:COMPANY},publisher:{'@type':'Organization',name:COMPANY,url:ORIGIN}};
 const body=`<article class="section blog-article"><p><a href="/blog">← Procurement Insights</a></p><header><p class="eyebrow">${esc(post.category)}</p><h1>${esc(post.title)}</h1><p class="lead">${esc(post.summary)}</p><p class="fine">${esc(new Date(post.publishedAt).toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'}))} · ${COMPANY}</p></header><div class="blog-prose">${post.body.map(block).join('')}</div><div class="panel blog-notice"><strong>Purchasing guidance</strong><p>This article is educational, not a price, contract, eligibility determination or guarantee. Always check the applicable buyer's specifications and procurement requirements.</p></div></article>`;
 return page(post.title,post.summary,route,body,{preview,schema});
}
export function blogFeed(posts){
 const items=posts.map(p=>`<item><title>${esc(p.title)}</title><link>${ORIGIN}/blog/${esc(p.slug)}</link><guid isPermaLink="true">${ORIGIN}/blog/${esc(p.slug)}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><category>${esc(p.category)}</category><description>${esc(p.summary)}</description></item>`).join('\n');
 const modified=posts.length?`<lastBuildDate>${new Date(posts[0].publishedAt).toUTCString()}</lastBuildDate>`:'';
 return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Tri-Point Procurement Insights</title><link>${ORIGIN}/blog</link><description>Original editorially approved procurement guidance from Tri-Point Government Solutions LLC.</description><language>en-us</language><atom:link href="${ORIGIN}${FEED}" rel="self" type="application/rss+xml"/>${modified}${items}</channel></rss>\n`;
}
