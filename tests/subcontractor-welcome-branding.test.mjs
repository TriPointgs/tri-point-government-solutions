import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {welcomeEmail,welcomeEmailHtml,WELCOME_LOGO_URL,welcomeEmailSettings} from '../lib/subcontractor-approval.mjs';

const reviewed={id:'f2a328dd-3473-4627-b9d0-69e98d970202',status:'reviewed',company:'Sample Field Services LLC',email:'contractor@example.org',consent:true,internalNotes:'PRIVATE_ONLY'};
test('uploaded owner logo is reproduced exactly and PNG is a properly sized email asset',()=>{
 const source=readFileSync('assets/subcontractor-welcome-logo.svg');
 assert.equal(createHash('sha256').update(source).digest('hex'),'7c7f1f35bf2d84b05aa5389ab319ad389305b15f6a8d17cb0c81f40183918f5d');
 const png=readFileSync('assets/subcontractor-welcome-logo.png');
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),820);
 assert.equal(png.readUInt32BE(20),166);
 assert.ok(png.length>=5000 && png.length<70000,'png asset should contain visible text but remain lightweight');
});
test('HTML welcome is branded, accessible and has the requested founder/CEO signoff',()=>{
 const m=welcomeEmail(reviewed);
 assert.equal(m.to,reviewed.email);
 assert.equal(m.subject,'Welcome to the Tri-Point subcontractor network');
 assert.equal(WELCOME_LOGO_URL,'https://tripointgs.com/assets/subcontractor-welcome-logo.png');
 assert.match(m.html,/<img[^>]+alt="Tri-Point Government Solutions LLC"/);
 assert.ok(m.html.includes('src="'+WELCOME_LOGO_URL+'"'));
 assert.match(m.html,/Welcome to the Network/);
 assert.match(m.html,/Adriel Lorenzo/);
 assert.match(m.html,/Founder \| CEO/);
 assert.match(m.html,/not a subcontract/);
 assert.match(m.html,/guarantee of work/);
 assert.match(m.html,/https:\/\/tripointgs.com\/login/);
 assert.match(m.text,/Adriel Lorenzo\nFounder \| CEO/);
 assert.match(m.text,/company, Sample Field Services LLC/);
 assert.doesNotMatch(m.html,/PRIVATE_ONLY|<script|<style\b|<iframe/i);
 assert.doesNotMatch(m.text,/PRIVATE_ONLY/);
});
test('untrusted company names cannot inject HTML, attributes, tags or script',()=>{
 const attack='Harbor <img src=x onerror="bad()"> & "Co"';
 const html=welcomeEmailHtml(attack);
 assert.ok(html.includes('Harbor &lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; &quot;Co&quot;'));
 assert.ok(!html.includes('Harbor <img'));
 assert.match(html,/Adriel Lorenzo/);
});
test('HTML remains available for preview, but does not enable production email',()=>{
 const mail=welcomeEmail(reviewed);
 assert.ok(mail.html.length>1900);
 assert.equal(welcomeEmailSettings({VERCEL_ENV:'production'}).enabled,false);
 assert.equal(welcomeEmailSettings({VERCEL_ENV:'preview',TP_SUBCONTRACTOR_WELCOME_ENABLED:'true',TP_SUBCONTRACTOR_WELCOME_APPROVED:'true',TP_SUBCONTRACTOR_WELCOME_API_KEY:'fake',TP_SUBCONTRACTOR_WELCOME_FROM:'network@send.tripointgs.com'}).enabled,false);
});
