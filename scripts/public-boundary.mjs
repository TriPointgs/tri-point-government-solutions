import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export const RETIRED=['learn','government-contracts'];
const sourceLink=/<a\b[^>]*href=["'](?:\/learn(?:[/?#][^"']*)?|\/government-contracts(?:[/?#][^"']*)?|https?:\/\/(?:[^/"']*\.)?(?:sam\.gov|myfloridamarketplace\.com|apexaccelerators\.us)[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi;
export const PUBLIC_FORBIDDEN=/href=["'][^"']*(?:\/learn(?:[/?#"'])|\/government-contracts(?:[/?#"'])|https?:\/\/(?:[^/"']*\.)?(?:sam\.gov|myfloridamarketplace\.com|apexaccelerators\.us))/i;
function exactly(html,old,replacement){assert.equal(html.split(old).length-1,1,`Expected one supported template marker: ${old.slice(0,90)}`);return html.replace(old,replacement);}
const LANDING=`<section class="hero"><div><p class="eyebrow">Tri-Point Subcontractor Network</p><h1>You do the work.<br><em>We coordinate the contracting.</em></h1><p class="lead">Introduce your business to Tri-Point Government Solutions for potential subcontracting work. Tell us your services, where you operate and what you can reliably support. Our team reviews potential fit and contacts selected businesses directly.</p><div class="actions"><a class="button" href="/contractors/join">Join the network — free</a><a class="button secondary" href="#how-it-works">How the network works</a></div><p class="fine">No required paid membership. No guaranteed work. No government experience required to submit a profile.</p></div><aside class="panel accent"><p class="eyebrow">Your capabilities. Our coordination.</p><h2>A direct business introduction.</h2><ol class="steps"><li><strong>Submit your company profile.</strong><p>Share your trade, service area, crew and realistic capacity.</p></li><li><strong>Our team reviews potential fit.</strong><p>We review requirements privately and decide which businesses to contact.</p></li><li><strong>Confirm interest and availability.</strong><p>When contacted, confirm your details and discuss the scope before any commitment.</p></li></ol></aside></section><section id="how-it-works" class="section"><div class="section-title"><p class="eyebrow">Built for subcontractor relationships</p><h2>One profile. Direct contact from Tri-Point.</h2><p>This is a subcontractor network, not an opportunity marketplace or training membership. Joining does not provide access to contracts, bid searches or a project feed. Our team contacts businesses individually when we choose to explore a potential fit.</p></div><div class="grid"><article class="card"><h3>Describe your capabilities</h3><p>Tell us the services, equipment, staffing and experience your business can support today. Be clear about your limits.</p></article><article class="card"><h3>Confirm details for each project</h3><p>Your total crew and the staff available for a particular job may differ. We ask about the specific work, timing and location before moving forward.</p></article><article class="card"><h3>Agree before committing</h3><p>An inquiry is not an award or subcontract. Scope, pricing, responsibilities and payment terms must be agreed separately in writing.</p></article></div></section>__SERVICE_SECTION__<section class="section"><h2>Before you join</h2><details><summary>What happens after I submit?</summary><p>You receive an on-screen application reference. Tri-Point reviews profiles internally and may contact selected businesses about potential subcontracting work. There is no guaranteed contact date, workload or award.</p></details><details><summary>Can I browse contracts or see other companies?</summary><p>No. This network is for introducing your own business to Tri-Point. Company profiles and project review are private. We do not provide a contractor-facing opportunity feed or directory.</p></details><details><summary>Does joining cost anything?</summary><p>No. The subcontractor network is free to join and does not enroll you in a paid subscription or training program.</p></details><details><summary>How can I update my information?</summary><p>Email <a href="mailto:info@tripointgs.com?subject=Subcontractor%20profile%20update">info@tripointgs.com</a> from your application contact address. Include your company name and the changes. We may verify your authority before updating the profile. A self-service account is not currently required.</p></details><details><summary>Do I need government contracting experience?</summary><p>No government contracting experience is required to submit a profile. Each proposed subcontract has its own requirements. Describe your experience accurately; documentation may be requested when relevant.</p></details><details><summary>What should I avoid submitting?</summary><p>Do not send banking information, tax identification numbers, passwords or identity documents through the signup form. Necessary documentation can be requested through an appropriate private process.</p></details></section><section class="section"><div class="callout"><h2>Introduce your business to Tri-Point.</h2><p>Your services. Your service area. Your realistic capacity.</p><a class="button" href="/contractors/join">Join the subcontractor network</a></div></section>`;

export function transformPage(input,route){
 let html=input;
 if(route==='/contractors'){
  const service=html.match(/<section class="section"><h2>Local services\. Real capabilities\.<\/h2>[\s\S]*?<\/section>/)?.[0];
  assert.ok(service,'Preserve the real service category section');
  const body=LANDING.replace('__SERVICE_SECTION__',service);
  assert.match(html,/<main id="main" class="wrap">/);
  html=html.replace(/<main id="main" class="wrap">[\s\S]*?<\/main>/,`<main id="main" class="wrap">${body}</main>`);
  html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>Subcontractor Network for Florida Businesses | Tri-Point</title>');
  html=html.replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*(">)/g,'$1Join Tri-Point’s free subcontractor network. Share your services, service area and capabilities for potential work coordinated by Tri-Point.$2');
  html=html.replace(/(<meta property="og:title" content=")[^"]*(">)/,'$1Tri-Point Subcontractor Network$2');
 }
 if(route==='/contractors/join'){
  const interests=html.match(/<label class="check"><input type="checkbox" name="interests" value="[^"]+">[\s\S]*?<\/label>/g)||[];
  assert.equal(interests.length,4,'Review changed interest controls before publishing');
  html=html.replace(/<label class="check"><input type="checkbox" name="interests" value="[^"]+">[\s\S]*?<\/label>/g,'');
  html=exactly(html,'<p><strong>Interested in</strong></p>','<p><strong>Subcontractor participation</strong></p><p class="fine">This introduction is for subcontracting with Tri-Point, not a bid marketplace or training program.</p><input type="hidden" name="interests" value="subcontracting">');
  assert.equal((html.match(/<select name="sam"/g)||[]).length,1);
  html=html.replace(/<label class="field">SAM\.gov registration\?<select name="sam"[\s\S]*?<\/select><\/label>/,'');
  assert.equal((html.match(/name="alertsOptIn"/g)||[]).length,1);
  html=html.replace(/<label class="check"><input type="checkbox" name="alertsOptIn">[\s\S]*?<\/label>/,'');
  html=html.replace(/<div class="pill-note">Not sure what qualifies you\?[\s\S]*?<\/div>/,'<div class="pill-note">Already submitted? Request a profile update from your application contact address at info@tripointgs.com. Do not email sensitive documents.</div>');
  html=html.replace('Tri-Point may contact me about this application and potential business relationships.','Tri-Point may contact me about this application, profile updates and potential subcontracting work.');
  html=html.replaceAll('Join the Free Tri-Point Contractor Network','Join the Free Tri-Point Subcontractor Network');
 }
 if(route==='/contractors/thanks')html=html.replace('<a class="button secondary" href="/learn">Get familiar with the process</a>','<a class="button secondary" href="/contractors">Return to the network</a>');
 if(route==='/privacy'||route==='/terms'){
  html=html.replace('Effective September 18, 2026.','Updated October 11, 2026.');
  html=html.replace('optional marketing preference, limited campaign label and referral code.','limited campaign label and referral code. Historical profiles may retain preferences recorded under an earlier notice.');
  html=html.replace('Optional future educational and opportunity emails require the separate opt-in on the form; no automatic email schedule is promised at launch.','This form permits contact about your application, profile updates and potential subcontracting work. It does not enroll you in a general marketing newsletter or provide access to an opportunity feed.');
  html=html.replace('Future general educational and opportunity marketing emails require the separate optional opt-in.','The subcontractor signup does not enroll you in training or a general opportunity newsletter.');
  html=html.replace('does not make assurances about unrelated third-party websites linked from our guides.','does not authorize unrelated marketing or publication of company profiles.');
 }
 html=html.replace(sourceLink,'');
 html=html.replace(/<div class="nav-links">([\s\S]*?)<\/div>/,(whole,inside)=>`<div class="nav-links">${inside.replace('<a href="/contractors">Contractor network</a>','<a href="/contractors">Subcontractor network</a><a href="/contractors#how-it-works">How it works</a><a href="/#contact">Contact</a>')}</div>`);
 html=html.replace('<a class="button small" href="/contractors/join">Join free</a>','<a href="/login">Sign in</a><a class="button small" href="/contractors/join">Join free</a>');
 html=html.replaceAll('potential teaming and subcontracting opportunities','potential subcontracting work coordinated by Tri-Point');
 html=html.replace('Start with the contractor network, contracting resources or our agency capabilities.','Start with the subcontractor network or our agency capabilities.');
 return html;
}

export function applyBoundary(root='dist'){
 const output=path.resolve(root);assert.equal(path.basename(output),'dist','Only generated dist output may be changed');
 for(const retired of RETIRED){fs.rmSync(path.join(output,retired),{recursive:true,force:true});fs.rmSync(path.join(output,retired+'.html'),{force:true});}
 const files=fs.readdirSync(output,{recursive:true}).filter(f=>f.endsWith('.html'));
 for(const file of files){const route=file==='index.html'?'/':'/'+file.slice(0,-5);const p=path.join(output,file);fs.writeFileSync(p,transformPage(fs.readFileSync(p,'utf8'),route));}
 const origin='https://tripointgs.com';
 fs.writeFileSync(path.join(output,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+origin+'/</loc></url><url><loc>'+origin+'/contractors</loc></url></urlset>');
 for(const file of files){const html=fs.readFileSync(path.join(output,file),'utf8');assert.doesNotMatch(html,PUBLIC_FORBIDDEN,`Removed navigation/source link remains: ${file}`);assert.equal((html.match(/<h1\b/g)||[]).length,1);for(const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){const p=m[1];if(p.startsWith('/api/')||p==='/admin/catalog')continue;const file=p==='/'?'index.html':p.slice(1);assert.ok(fs.existsSync(path.join(output,file))||fs.existsSync(path.join(output,file+'.html')),`Broken link: ${p}`);}}
 const form=fs.readFileSync(path.join(output,'contractors/join.html'),'utf8');
 assert.doesNotMatch(form,/name="(?:sam|alertsOptIn)"|value="(?:prime|guidance|teaming)"/);
 assert.match(form,/<input type="hidden" name="interests" value="subcontracting">/);
 assert.ok(fs.existsSync(path.join(output,'contractors/admin/opportunities.html')),'Existing private workspace must remain');
 console.log(`Subcontractor-only public boundary PASS: ${files.length} HTML pages, 2 sitemap entries, retired resource files removed, existing private workspace retained.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)applyBoundary();
