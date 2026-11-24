import {injectBrandHomeBadges} from '../lib/brand-home.mjs';
import {wasabiPage} from '../lib/wasabi-page.mjs';
import {ptzopticsPage} from '../lib/ptzoptics-page.mjs';
import {arcticWolfPage,injectArcticWolfHome} from '../lib/arctic-wolf-page.mjs';
import {contactPage} from '../lib/contact-page.mjs';
import {quoteMarketplace} from '../lib/quote-marketplace.mjs';
import {marketplaceCustomerConfig} from '../lib/marketplace-customer-auth.mjs';
// Production-safe visual rollout: keep the current public routes and behaviors while reusing
// the approved new-site visual shell. The marketplace is static, not the private shop pilot.
import fs from 'node:fs';
import path from 'node:path';
import {applySiteExperience,homeHero} from '../lib/site-experience.mjs';
const out='dist';
const preview=process.env.VERCEL_ENV!=='production';
const analyticsMeasurementId = 'G-J4BCEYLBCZ';
const analyticsPanel = `<section id="analytics-choices" class="analytics-choices" aria-labelledby="analytics-heading" hidden>
 <h2 id="analytics-heading">Website analytics</h2>
 <p>Allow Google Analytics cookies to help us understand visits, partner campaigns and completed quote requests. <a href="/privacy#website-analytics">Privacy notice</a></p>
 <div class="analytics-actions">
  <button type="button" class="experience-button" data-analytics-allow>Allow analytics</button>
  <button type="button" class="experience-button outline" data-analytics-decline>Decline analytics</button>
 </div>
</section>`;
function addAnalyticsPreferences(route, trackPage) {
 const filename = path.join(out, route === '/' ? 'index.html' : `${route.slice(1)}.html`);
 const html = fs.readFileSync(filename, 'utf8');
 const footerLink = '<a href="/terms">Network terms</a>';
 if (!html.includes(footerLink)) throw Error(`Analytics settings require the public footer on ${route}`);
 const settings = '<button type="button" class="analytics-settings" data-analytics-settings>Analytics settings</button>';
 const script = `<script defer src="/assets/site-analytics.js" data-measurement-id="${analyticsMeasurementId}" data-track-page="${trackPage}"></script>`;
 fs.writeFileSync(filename, html.replace(footerLink, footerLink + settings)
  .replace('</head>', script + '</head>')
  .replace('</body>', analyticsPanel + '</body>'));
}
const solutionPages = {
 wasabi: wasabiPage,
 ptzoptics: ptzopticsPage,
 'arctic-wolf': arcticWolfPage,
};
function publishPublicPage(route, html) {
 const page = preview ? html : html.replace(
  /<meta name="robots" content="noindex, (?:nofollow|follow)">/,
  '<meta name="robots" content="index, follow">',
 );
 fs.writeFileSync(path.join(out, `${route.slice(1)}.html`), page);
}
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
const homeFile=path.join(out,'index.html');
fs.writeFileSync(homeFile,injectArcticWolfHome(injectBrandHomeBadges(fs.readFileSync(homeFile,'utf8'))));
// Publish the reviewed request-first marketplace; supplier checkout remains separate.
fs.writeFileSync(path.join(out,'marketplace.html'),quoteMarketplace({customerSignInEnabled:Boolean(marketplaceCustomerConfig())}));
publishPublicPage('/contact', contactPage());
const quoteOptions=[];
for(const slug of Object.keys(solutionPages)){
 const catalog=JSON.parse(fs.readFileSync(`content/${slug}/catalog.json`,'utf8'));
 const brand=catalog.brand||catalog.page.name;
 for(const product of catalog.products.filter(product=>product.status!=='legacy')){
  quoteOptions.push({
   brand,name:product.name,description:brand+' · '+product.name,
   category:slug==='arctic-wolf'?'Networking & security':product.category,image:product.image
  });
 }
}
fs.writeFileSync(path.join(out,'assets','quote-options.json'),JSON.stringify(quoteOptions));
const adminFile=path.join(out,'contractors','admin.html');fs.writeFileSync(adminFile,fs.readFileSync(adminFile,'utf8').replace('<div class="toolbar">','<div class="toolbar"><a class="button secondary" href="/admin/inquiries">Website quote requests</a>'));
const privacyFile=path.join(out,'privacy.html'),privacySection='<section id="website-inquiries"><h2>Website quote requests and inquiries</h2><p>When you submit a website request, we collect the contact and organization details, interests, selected items and quantities, project details, delivery location, dates, references, and review preferences you provide. We use these details to review and respond to your request, not to place an order or enroll you in marketing.</p><p>Requests are stored privately with our hosting provider and are accessible to authorized Tri-Point staff. A separate internal email alert contains a request reference and a link to the private workspace; it excludes your contact details and submitted project content. Our email provider processes that alert. This form does not send an automatic customer confirmation email.</p><p>We retain requests while needed for review, follow-up, and legitimate business recordkeeping. To request access, correction or deletion, contact info@tripointgs.com from the email used on your request. We may verify your authority. Product selections stay in this browser tab to carry between pages; contact details and project messages are not saved in browser storage. Do not submit payment details, passwords, tax IDs, exemption documents, or sensitive procurement information here. Exemption-review requests do not grant tax-exempt status.</p></section>';
fs.writeFileSync(privacyFile,fs.readFileSync(privacyFile,'utf8').replace('</article>',privacySection+'</article>'));
fs.mkdirSync(path.join(out,'solutions'),{recursive:true});
for (const [slug, render] of Object.entries(solutionPages)) {
 publishPublicPage(`/solutions/${slug}`, render());
}
const siteMap=path.join(out,'sitemap.xml');
if(!preview&&fs.existsSync(siteMap)){
 const xml=fs.readFileSync(siteMap,'utf8');
 const solutionRoutes = Object.keys(solutionPages).map(slug => `/solutions/${slug}`);
 const entries=['/marketplace','/contact','/about',...solutionRoutes].map(route=>`<url><loc>https://tripointgs.com${route}</loc></url>`).filter(entry=>!xml.includes(entry));
 const publicSitemap = xml.replace('</urlset>', entries.join('') + '</urlset>');
 fs.writeFileSync(siteMap, publicSitemap);

 for (const [, route] of publicSitemap.matchAll(/<loc>https:\/\/tripointgs\.com(\/[^<]*)<\/loc>/g)) {
  addAnalyticsPreferences(route, true);
 }
 const analyticsNotice = '<section id="website-analytics"><h2>Optional website analytics</h2><p>With your permission, Google Analytics uses cookies to measure visits to public pages and understand where visitors come from. Analytics uses page paths and referring domains. The website removes query parameters and fragments before sending page addresses. For our published partner social links, we separately send the recognized platform, social medium and partner campaign name to measure campaign performance. We also record when a website quote request is successfully received, without sending your name, contact information, project details, product selections or request reference to Analytics. Use Analytics settings in the footer to change your choice. <a href="https://policies.google.com/technologies/partner-sites">How Google uses information from sites that use its services</a>.</p></section>';
 const privacy = fs.readFileSync(privacyFile, 'utf8');
 fs.writeFileSync(privacyFile, privacy.replace('</article>', analyticsNotice + '</article>'));
 addAnalyticsPreferences('/privacy', false);
}
console.log('Public site: quote marketplace and private request form published; checkout/PO features remain unpublished.');

// Keep Google's Search Console ownership challenge available at the domain root.
const searchConsoleVerificationFile='googlec0d270305482d6e6.html';
fs.copyFileSync(searchConsoleVerificationFile,path.join(out,searchConsoleVerificationFile));
