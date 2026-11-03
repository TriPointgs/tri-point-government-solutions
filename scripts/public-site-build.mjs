import {injectBrandHomeBadges} from '../lib/brand-home.mjs';
import {wasabiPage} from '../lib/wasabi-page.mjs';
import {ptzopticsPage} from '../lib/ptzoptics-page.mjs';
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
const robots=preview?'noindex, nofollow':'index, follow';
function page(route,title,description,inner){let html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Tri-Point Government Solutions</title><meta name="description" content="${description}"><link rel="canonical" href="https://tripointgs.com${route}"><meta name="robots" content="${robots}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="https://tripointgs.com${route}"></head><body><main id="main">${inner}</main></body></html>`;html=applySiteExperience(html,{route});html=html.replace('</head>','<link rel="stylesheet" href="/assets/marketplace-coming-soon.css"></head>');fs.writeFileSync(out+route+'.html',html);}
page('/marketplace','Marketplace Coming Soon','The Tri-Point Marketplace is coming soon. Explore our government, education and business sourcing solutions when we launch.',`<section class="experience-coming" aria-labelledby="marketplace-title"><div class="experience-coming-shell"><div><p class="eyebrow">Tri-Point Marketplace</p><h1 id="marketplace-title">Our Marketplace Is <em>Coming Soon</em></h1><p class="lead">We're excited to bring you the Tri-Point Marketplace soon, where you'll be able to explore our products and solutions. Stay tuned for the launch.</p><div class="experience-coming-actions"><a class="primary" href="/contact">Contact Our Team <span aria-hidden="true">&nbsp;→</span></a><a class="secondary" href="/">Explore Tri-Point</a></div></div><div class="experience-coming-icon" aria-hidden="true"><svg viewBox="0 0 120 120"><rect x="25" y="44" width="70" height="58" rx="5"/><path d="M23 44L31 19h58l8 25M42 19v25m36-25v25M44 60h32M60 44v58M37 78h46"/><path d="M40 37c0 10 15 10 15 0m10 0c0 10 15 10 15 0"/></svg></div></div><div class="experience-coming-sub"><span><strong>Technology • Hardware • Software • Solutions</strong><br>Supporting businesses, educational institutions and government buyers.</span><a href="mailto:info@tripointgs.com?subject=Tri-Point%20Product%20Sourcing%20Inquiry">Need sourcing assistance now?</a></div></section>`);
page('/contact','Contact Our Sourcing Team','Contact Tri-Point Government Solutions for government procurement, technology sourcing and capabilities inquiries.',`<section class="experience-contact-simple"><p class="experience-eyebrow">Contact Tri-Point</p><h1>Tell us what you need.</h1><p>We can review product sourcing, technology requirements and government procurement inquiries while the marketplace is being prepared.</p><div class="contact-panel"><div id="brand-inquiry-selection" hidden><p>Selected requirement</p><h2 id="brand-inquiry-name"></h2><p>Your selected product is included in the email draft when you choose the address below. Add your quantities, scope, location, and timing before sending.</p></div><h2>Get in touch</h2><p>Email your requirements, quantities, preferred delivery location and target response date. Please do not include passwords or sensitive information.</p><p><a class="email" id="contact-email-link" href="mailto:info@tripointgs.com?subject=Requirement%20Inquiry%20for%20Tri-Point">info@tripointgs.com</a></p><p><a href="/">Return to our capabilities</a></p></div></section>`);
const contactFile=path.join(out,'contact.html');fs.writeFileSync(contactFile,fs.readFileSync(contactFile,'utf8').replace('</head>','<script type="module" src="/assets/brand-inquiry.js"></script></head>'));
fs.mkdirSync(path.join(out,'solutions'),{recursive:true});
fs.writeFileSync(path.join(out,'solutions','wasabi.html'),wasabiPage());
fs.writeFileSync(path.join(out,'solutions','ptzoptics.html'),ptzopticsPage());
const siteMap=path.join(out,'sitemap.xml');if(!preview&&fs.existsSync(siteMap)){const xml=fs.readFileSync(siteMap,'utf8');if(!xml.includes('https://tripointgs.com/marketplace'))fs.writeFileSync(siteMap,xml.replace('</urlset>','<url><loc>https://tripointgs.com/marketplace</loc></url><url><loc>https://tripointgs.com/contact</loc></url></urlset>'));}
console.log('Public site: approved redesign applied; marketplace is static Coming Soon; checkout/PO features remain unpublished.');
