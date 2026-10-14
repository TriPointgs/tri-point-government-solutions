import fs from 'node:fs/promises';
import path from 'node:path';
import {parseContentMxFeed} from '../lib/contentmx-sync.mjs';
import {approvedPosts} from '../lib/blog.mjs';

const url=process.env.CONTENTMX_RSS_URL;
if(!url)throw Error('CONTENTMX_RSS_URL is required; no site changes made');
const endpoint=new URL(url);
if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||!endpoint.hostname.match(/^[a-z0-9.-]+$/i)||endpoint.port)throw Error('Invalid RSS endpoint');
if(!/^[a-z0-9.-]+$/i.test(endpoint.hostname)||!endpoint.hostname.toLowerCase().startsWith('tripointgs.'))throw Error('RSS endpoint must use the Tri-Point ContentMX network hostname');
const controller=new AbortController();
const timeout=setTimeout(()=>controller.abort(),12000);
let response;
try {response=await fetch(endpoint,{headers:{accept:'application/rss+xml, application/xml, text/xml'},redirect:'error',signal:controller.signal});}
finally{clearTimeout(timeout);}
if(!response.ok)throw Error('RSS fetch failed HTTP '+response.status);
const type=response.headers.get('content-type')||'';
if(type&&!/xml|rss|text\/plain/i.test(type))throw Error('Unexpected ContentMX content type');
const body=await response.text();
const feed=parseContentMxFeed(body,{limit:50});
if(!feed.length){console.log('No eligible RSS items; leaving published content unchanged.');process.exit(0);}
const dir='content/blog',filenames=(await fs.readdir(dir)).filter(x=>x.endsWith('.json'));
const records=await Promise.all(filenames.map(async filename=>JSON.parse(await fs.readFile(path.join(dir,filename),'utf8'))));
const existing=new Set(records.map(x=>x.slug));
const selected=feed.filter(x=>!existing.has(x.slug)).slice(0,12);
for(const post of selected) {
 // Validate every new entry and the existing set before writing anything.
 approvedPosts([...records,post]);
}
for(const post of selected){
 const filepath=path.join(dir,post.slug+'.json');
 await fs.writeFile(filepath,JSON.stringify(post,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({fetched:feed.length,published:selected.length,duplicates:feed.length-selected.length,oldDraftsUntouched:true}));
