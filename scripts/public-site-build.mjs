import {injectBrandHomeBadges} from '../lib/brand-home.mjs';
import {wasabiPage} from '../lib/wasabi-page.mjs';
import {ptzopticsPage} from '../lib/ptzoptics-page.mjs';
import {contactPage} from '../lib/contact-page.mjs';
import {quoteMarketplace} from '../lib/quote-marketplace.mjs';
// Production-safe visual rollout: keep the current public routes and behaviors while reusing
// the approved new-site visual shell. The marketplace is static, not the private shop pilot.
import fs from 'node:fs';
import path from 'node:path';
import {applySiteExperience,homeHero} from '../lib/site-experience.mjs';
const out='dist';
const preview=process.env.VERCEL_ENV!=='production';
const theme='@import url("/assets/marketplace-theme.css");\n';
const styled=['blog.css','catalog.css','contact.css','experience.css','fortinet.css','lenovo.css','network.css','opportunities.css','zoom.css'];
for(const name of styled){const f=path.join(out,'assets',name);if(!fs.existsSync(f))continue;const css=fs.readFileSync(f,'utf8');if(/@charset\b/i.test(css))throw Error('Unexpected charset in '+name);if(!css.startsWith(theme))fs.writeFileSync(f,theme+css);}
function scan(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?scan(path.join(root,x.name)):x.name.endsWith('.html')?[path.join(root,x.name)]:[]);}
const protectedPrefix=['/admin/','/contractors/admin/','/buyer-preview/'];
for(const filename of scan(out)){
 const route=filename===path.join(out,'index.html')?'/':'/'+filename.slice(out.length+1,-5).replaceAll('\\','/');
 if(protectedPrefix.some(x=>route.startsWith(x))||route==='/login')continue;
 let html=fs.readFileSync(filename,'utf8');
 if(route==='/'){
  if(!html.includes('<section class="hero">'))throw Error('Home hero structure changed');
  html=html.replace(/<section class="hero">[\s\S]*?<\/section>/,homeHero()).replace('<main id="top">','<main id="main">');
 }
 html=applySiteExperience(html,{route});
 if(!html.includes('experience-header')||!html.includes('experience-footer'))throw Error('Sitewide design did not apply to '+route);
 fs.writeFileSync(filename,html);
}
const homeFile=path.join(out,'index.html');fs.writeFileSync(homeFile,injectBrandHomeBadges(fs.readFileSync(homeFile,'utf8')));
const contactFile=path.join(out,'contact.html');
// Publish the reviewed request-first marketplace; supplier checkout remains separate.
fs.writeFileSync(path.join(out,'marketplace.html'),quoteMarketplace());
fs.writeFileSync(contactFile,contactPage());
const quoteOptions=[];
for(const slug of ['wasabi','ptzoptics']){const catalog=JSON.parse(fs.readFileSync(`content/${slug}/catalog.json`,'utf8'));for(const p of catalog.products.filter(p=>p.status!=='legacy'))quoteOptions.push({brand:catalog.brand,name:p.name,description:catalog.brand+' · '+p.name,category:p.category,image:p.image});}
fs.writeFileSync(path.join(out,'assets','quote-options.json'),JSON.stringify(quoteOptions));
const adminFile=path.join(out,'contractors','admin.html');fs.writeFileSync(adminFile,fs.readFileSync(adminFile,'utf8').replace('<div class="toolbar">','<div class="toolbar"><a class="button secondary" href="/admin/inquiries">Website quote requests</a>'));
const privacyFile=path.join(out,'privacy.html'),privacySection='<section id="website-inquiries"><h2>Website quote requests and inquiries</h2><p>When you submit a website request, we collect the contact and organization details, interests, selected items and quantities, project details, delivery location, dates, references, and review preferences you provide. We use these details to review and respond to your request, not to place an order or enroll you in marketing.</p><p>Requests are stored privately with our hosting provider and are accessible to authorized Tri-Point staff. A separate internal email alert contains a request reference and a link to the private workspace; it excludes your contact details and submitted project content. Our email provider processes that alert. This form does not send an automatic customer confirmation email.</p><p>We retain requests while needed for review, follow-up, and legitimate business recordkeeping. To request access, correction or deletion, contact info@tripointgs.com from the email used on your request. We may verify your authority. Product selections stay in this browser tab to carry between pages; contact details and project messages are not saved in browser storage. Do not submit payment details, passwords, tax IDs, exemption documents, or sensitive procurement information here. Exemption-review requests do not grant tax-exempt status.</p></section>';
fs.writeFileSync(privacyFile,fs.readFileSync(privacyFile,'utf8').replace('</article>',privacySection+'</article>'));
fs.mkdirSync(path.join(out,'solutions'),{recursive:true});
fs.writeFileSync(path.join(out,'solutions','wasabi.html'),wasabiPage());
fs.writeFileSync(path.join(out,'solutions','ptzoptics.html'),ptzopticsPage());
const siteMap=path.join(out,'sitemap.xml');if(!preview&&fs.existsSync(siteMap)){const xml=fs.readFileSync(siteMap,'utf8');if(!xml.includes('https://tripointgs.com/marketplace'))fs.writeFileSync(siteMap,xml.replace('</urlset>','<url><loc>https://tripointgs.com/marketplace</loc></url><url><loc>https://tripointgs.com/contact</loc></url></urlset>'));}
console.log('Public site: quote marketplace and private request form published; checkout/PO features remain unpublished.');
