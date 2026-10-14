import {createHash} from 'node:crypto';

const decode=value=>String(value??'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi,part=>{
 const known={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
 if(known[part.toLowerCase()])return known[part.toLowerCase()];
 const n=part[2].toLowerCase()==='x'?parseInt(part.slice(3,-1),16):parseInt(part.slice(2,-1),10);
 return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
});
export function plainText(raw){
 return decode(String(raw??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1').replace(/<[^>]*>/g,' ')).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
}
function inner(block,tag){
 const m=block.match(new RegExp('<(?:[\\w.-]+:)?'+tag+'(?:\\s[^>]*?)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?'+tag+'\\s*>','i'));
 return m?plainText(m[1]):'';
}
export function safeSourceUrl(value){
 try{
  const url=new URL(String(value??'').trim());
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))return null;
  const host=url.hostname.toLowerCase();
  if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host)||host.endsWith('.internal')||host.endsWith('.local'))return null;
  url.hash='';
  return url.toString();
 }catch{return null;}
}
export function parseContentMxFeed(xml,{now=new Date(),limit=12}={}){
 if(typeof xml!=='string'||xml.length>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Invalid or oversized feed');
 if(!/<(?:rss|feed)\b/i.test(xml))throw Error('Not an RSS or Atom feed');
 const rawItems=[...xml.matchAll(/<(item|entry)(?:\s[^>]*?)?>([\s\S]*?)<\/\1\s*>/gi)].slice(0,50);
 const posts=[],seen=new Set();
 for(const [,type,block] of rawItems){
  const title=inner(block,'title').slice(0,140);
  const rawLink=inner(block,'link')||block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1];
  const sourceUrl=safeSourceUrl(decode(rawLink));
  if(!title||!sourceUrl)continue;
  const uniqueKey=inner(block,'guid')||inner(block,'id')||sourceUrl;
  const slug='contentmx-'+createHash('sha256').update(uniqueKey).digest('hex').slice(0,24);
  if(seen.has(slug))continue;
  seen.add(slug);
  const dateString=inner(block,'pubDate')||inner(block,'published')||inner(block,'updated');
  let when=dateString?new Date(dateString):now;
  if(!Number.isFinite(when.getTime()))continue;
  if(when.getTime()>now.getTime()+86400000||now.getTime()-when.getTime()>90*86400000)continue;
  if(when>now)when=now;
  const prohibited=/Zoom\s+(?:for\s+Defense|Contact\s+Center|Virtual\s+Agent)|(?:HP|Brother)\s+(?:authorized|certified)\s+reseller/i;
  if(prohibited.test(title))continue;
  // Partner content stays with its publisher. Store a factual 20-word preview, not full articles or media.
  const description=inner(block,'description')||inner(block,'summary');
  const excerpt=description.split(/\s+/).slice(0,20).join(' ').slice(0,180);
  const summary=excerpt||'A technology resource shared through Tri-Point’s TD SYNNEX marketing channel.';
  posts.push({
   slug,title,summary,category:'Partner technology updates',status:'syndicated',
   publishedAt:when.toISOString().replace('.000Z','Z'),
   sourceName:'TD SYNNEX ContentMX',sourceUrl,
   body:[{type:'paragraph',text:'This short link preview highlights partner content shared through Tri-Point’s marketing channel. View the original source for complete details, specifications, and availability.'}]
  });
  if(posts.length>=limit)break;
 }
 return posts;
}
