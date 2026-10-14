import test from 'node:test';
import assert from 'node:assert/strict';
import {parseContentMxFeed,plainText,safeSourceUrl} from '../lib/contentmx-sync.mjs';
import {approvedPosts,blogFeed,blogArticle} from '../lib/blog.mjs';
const feed=[
 '<?xml version="1.0"?><rss version="2.0"><channel><title>TRI-POINT GOVERNMENT SOLUTIONS LLC</title>',
 '<item><title>Mass Transit Solutions Brief</title><link>https://Tripointgs.lll-ll.com?i=5846549</link><description>Real-time payments in transit require low latency and security across moving fleets. Download the solution brief.</description><pubDate>Tue, 13 Oct 2026 22:46:26 -0400</pubDate><guid isPermaLink="false">https://Tripointgs.lll-ll.com?page&amp;i=5846549</guid></item>',
 '<item><title>Advance Your Cybersecurity Maturity</title><link>https://Tripointgs.lll-ll.com?i=5846548</link><description>How secure-by-design solutions can help federal teams strengthen recovery.</description><pubDate>Tue, 13 Oct 2026 21:27:43 -0400</pubDate><guid isPermaLink="false">https://Tripointgs.lll-ll.com?page&amp;i=5846548</guid></item>',
 '<item><title>Microsoft 365 Copilot Customer Stories</title><link>https://Tripointgs.lll-ll.com?i=5846546</link><description>Watch businesses explore AI productivity through Copilot.</description><pubDate>Tue, 13 Oct 2026 21:23:28 -0400</pubDate><guid isPermaLink="false">https://Tripointgs.lll-ll.com?page&amp;i=5846546</guid></item>',
 '</channel></rss>'
].join('');
test('imports the three user-supplied RSS entries as attributed link previews',()=>{
 const posts=parseContentMxFeed(feed,{now:new Date('2026-10-14T04:00:00Z')});
 assert.equal(posts.length,3);
 assert.deepEqual(posts.map(x=>x.title),['Mass Transit Solutions Brief','Advance Your Cybersecurity Maturity','Microsoft 365 Copilot Customer Stories']);
 const validated=approvedPosts(posts);
 assert.equal(validated.length,3);
 for(const p of validated){
  assert.equal(p.status,'syndicated');
  assert.equal(p.sourceName,'TD SYNNEX ContentMX');
  assert.match(blogArticle(p),/Read original source/);
  assert.match(blogArticle(p),/External partner resource/);
  assert.ok(!p.sourceUrl.includes('javascript:'));
 }
 assert.equal((blogFeed(validated).match(/<item>/g)||[]).length,3);
});
test('stable slug is identical across repeated runs',()=>{
 const options={now:new Date('2026-10-14T04:00:00Z')};
 assert.deepEqual(parseContentMxFeed(feed,options).map(p=>p.slug),parseContentMxFeed(feed,options).map(p=>p.slug));
});
test('unsafe markup and non-https source URLs cannot be imported',()=>{
 const attack=feed.replace('Mass Transit Solutions Brief','<img src=x onerror=alert(1)>Mass Transit').replace('https://Tripointgs.lll-ll.com?i=5846549','javascript:alert(1)');
 const result=parseContentMxFeed(attack,{now:new Date('2026-10-14T04:00:00Z')});
 assert.equal(result.length,2);
 assert.ok(!result.some(p=>/onerror=/.test(p.title)));
 assert.equal(safeSourceUrl('http://example.org'),null);
 assert.equal(safeSourceUrl('https://localhost/private'),null);
 assert.equal(plainText('<script>alert(1)</script>'),'alert(1)');
});
test('old content excluded and syndicated records cannot claim approval',()=>{
 assert.equal(parseContentMxFeed(feed,{now:new Date('2027-01-14T04:00:00Z')}).length,0);
 const post=parseContentMxFeed(feed,{now:new Date('2026-10-14T04:00:00Z')})[0];
 assert.throws(()=>approvedPosts([{...post,approvedBy:'fake',approvedAt:post.publishedAt}]));
});
test('invalid entities and unsafe XML declarations fail closed',()=>{
 assert.throws(()=>parseContentMxFeed('<!DOCTYPE rss><rss></rss>'));
 assert.throws(()=>parseContentMxFeed('not an XML feed'));
});
