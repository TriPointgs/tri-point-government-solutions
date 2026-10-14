import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {approvedPosts,validatePost,blogIndex,blogArticle,blogFeed,xmlEscape} from '../lib/blog.mjs';

const records=readdirSync(new URL('../content/blog/',import.meta.url)).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(readFileSync(new URL('../content/blog/'+x,import.meta.url),'utf8')));
const manuscript=records[0];
const approved=()=>({...structuredClone(manuscript),status:'approved',approvedBy:'Tri-Point editorial reviewer',approvedAt:'2026-10-13T13:00:00Z',publishedAt:'2026-10-13T14:00:00Z'});
test('sample articles remain unapproved',()=>{assert.equal(records.length,2);assert.equal(approvedPosts(records).length,0);});
test('articles require valid unique slugs and approved metadata',()=>{for(const override of [{slug:'../foo'},{slug:'A TEST'},{status:'published'},{approvedBy:'invented'},{body:[{type:'html',text:'<script>alert(1)</script>'}]}])assert.throws(()=>validatePost({...manuscript,...override}));});
test('approved articles require named signoff and valid UTC dates',()=>{for(const override of [{approvedBy:''},{approvedAt:null},{publishedAt:'2026-02-30T00:00:00Z'},{approvedAt:'2026-10-15T12:00:00Z'}])assert.throws(()=>validatePost({...approved(),...override}));});
test('approval emits one complete blog article and RSS item with public canonical URL',()=>{const post=approvedPosts([approved()]);assert.equal(post.length,1);const html=blogArticle(post[0]);assert.match(html,/BlogPosting/);assert.match(html,/1017 Cottonwood Street/);assert.match(html,/blog\/feed.xml/);const rss=blogFeed(post);assert.match(rss,/<rss version="2.0"/);assert.match(rss,/<item>/);assert.match(rss,/\/blog\/it-hardware-rfq-checklist|\/blog\/software-license-renewal-planning/);assert.match(rss,/Tue, 13 Oct 2026 14:00:00 GMT/);});
test('unapproved articles cannot be rendered as public article URLs',()=>assert.throws(()=>blogArticle(validatePost(manuscript))));
test('HTML, JSON-LD and RSS escape untrusted editorial text',()=>{const p=approved();p.title='Buyer & Vendor <script>alert(1)</script>';p.summary='RFQ "Checklist" & supplier sourcing';p.body=[{type:'paragraph',text:'Supplier <img src=x onerror=alert(1)> & vendor'}];const article=blogArticle(validatePost(p));assert.doesNotMatch(article,/<script>alert\(1\)<\/script>/);assert.match(article,/&lt;img/);const feed=blogFeed(approvedPosts([p]));assert.match(feed,/Buyer &amp; Vendor &lt;script&gt;/);assert.doesNotMatch(feed,/<script>/);});
test('RSS with no approved items is well-formed and does not invent articles',()=>{const rss=blogFeed([]);assert.match(rss,/<channel>/);assert.match(rss,/<\/rss>/);assert.doesNotMatch(rss,/<item>/);});
test('duplicate article slugs cause failure, not silent overwrite',()=>assert.throws(()=>approvedPosts([manuscript,structuredClone(manuscript)])));
test('blog contains only Tri-Point brand and no vendor-authorization claims',()=>{const page=blogIndex([],{});assert.match(page,/Procurement Insights/);assert.match(page,/Tri-Point Government Solutions LLC/);assert.match(page,/1017 Cottonwood Street/);assert.doesNotMatch(page,/Zoom is approved|HP Authorized|Brother Authorized/);});
test('preview robots directive remains noindex',()=>{assert.match(blogIndex([],{preview:true}),/noindex, nofollow/);assert.match(blogIndex([],{preview:false}),/index, follow/);});
test('XML helper encodes special characters',()=>assert.equal(xmlEscape(`A&B <B> "test"`),'A&amp;B &lt;B&gt; &quot;test&quot;'));
