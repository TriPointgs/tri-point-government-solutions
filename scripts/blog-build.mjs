import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {approvedPosts,blogIndex,blogArticle,blogFeed,ORIGIN,FEED} from '../lib/blog.mjs';
import {BUSINESS_ADDRESS_TEXT} from '../lib/business-address.mjs';
const dist='dist',directory='content/blog',preview=process.env.VERCEL_ENV!=='production';
const files=fs.readdirSync(directory).filter(f=>f.endsWith('.json')).sort();
const input=files.map(file=>JSON.parse(fs.readFileSync(path.join(directory,file),'utf8')));
const posts=approvedPosts(input);
fs.mkdirSync(dist+'/blog',{recursive:true});
const page=blogIndex(posts,{preview});
fs.writeFileSync(dist+'/blog.html',page);
fs.writeFileSync(dist+'/blog/feed.xml',blogFeed(posts));
for(const article of posts)fs.writeFileSync(dist+'/blog/'+article.slug+'.html',blogArticle(article,{preview}));
assert.ok(fs.existsSync(dist+'/blog/feed.xml'),'RSS feed missing');
assert.ok(page.includes(BUSINESS_ADDRESS_TEXT),'Blog must show Tri-Point business contact');
const sitemapPath=dist+'/sitemap.xml';let sitemap=fs.readFileSync(sitemapPath,'utf8');
assert.ok(!sitemap.includes('/blog'),'Blog sitemap must only be written by this build stage');
if(!preview){
 const loc=['/blog',...posts.map(p=>'/blog/'+p.slug)].map(x=>'<url><loc>'+ORIGIN+x+'</loc></url>').join('');
 sitemap=sitemap.replace('</urlset>',loc+'</urlset>');
 fs.writeFileSync(sitemapPath,sitemap);
}
const allPages=fs.readdirSync(dist,{recursive:true}).filter(f=>f.endsWith('.html')&&f!=='blog.html'&&!f.startsWith('blog/'));
for(const name of allPages){
 const location=dist+'/'+name;let html=fs.readFileSync(location,'utf8');
 const marker='<div class="nav-links">';
 if(html.includes(marker)){
  assert.ok(!html.includes('href="/blog"'),'Blog navigation already exists: '+name);
  html=html.replace(marker,marker+'<a href="/blog">Insights</a>');
  fs.writeFileSync(location,html);
 }
}
const feed=fs.readFileSync(dist+FEED,'utf8');
assert.match(feed,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
assert.ok(!feed.includes('TD SYNNEX automatic syndication'),'No automatic vendor syndication');
assert.equal((page.match(/<h1\b/g)||[]).length,1);
assert.doesNotMatch(sitemap,/\/solutions\/zoom/);
const allArticles=fs.readdirSync('dist/blog').filter(f=>f.endsWith('.html')&&f!=='index.html');
assert.equal(allArticles.length,posts.length,'Draft articles must never be published');
for(const file of fs.readdirSync(dist,{recursive:true}).filter(f=>f.endsWith('.html'))){
 const html=fs.readFileSync(dist+'/'+file,'utf8');
 for(const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){
  const relative=match[1];
  if(relative.startsWith('/api/')||['/contractors/admin/zoom','/solutions/zoom','/solutions/zoom/quote'].includes(relative))continue;
  const target=relative==='/'?'index.html':relative.slice(1);
  assert.ok(fs.existsSync(dist+'/'+target)||fs.existsSync(dist+'/'+target+'.html'),`Broken link ${relative} in ${file}`);
 }
}
assert.doesNotMatch(fs.readFileSync(dist+'/blog.html','utf8'),/Zoom Contact Center|Zoom Virtual Agent|Zoom for Defense/);
console.log(`Tri-Point blog: ${posts.length} approved articles, ${input.length-posts.length} drafts held, valid RSS 2.0 generated, Zoom marketing remains gated.`);
