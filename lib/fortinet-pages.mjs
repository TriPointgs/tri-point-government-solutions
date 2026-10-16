import {BUSINESS_ADDRESS_HTML,BUSINESS_POSTAL_ADDRESS} from './business-address.mjs';
export const FORTINET_ROUTE='/solutions/fortinet';
export const FORTINET_BADGE='/assets/fortinet-advocate-partner.webp';
export const FORTINET_BADGE_LINED='/assets/fortinet-advocate-partner-lined.webp';
const SITE='https://tripointgs.com', COMPANY='Tri-Point Government Solutions LLC';
export function fortinetBadge({lined=false}={}){
 const src=lined?FORTINET_BADGE_LINED:FORTINET_BADGE;
 return '<img class="fortinet-advocate-badge" src="'+src+'" alt="Fortinet Engage Advocate Partner badge" width="640" height="'+(lined?'269':'216')+'" loading="lazy" decoding="async">';
}
export function injectFortinetHome(html){
 const marker='<section id="contact"';
 if(!html.includes(marker)||html.includes('id="fortinet-solutions"')||!html.includes('id="lenovo-solutions"'))throw Error('Homepage partner section placement changed or duplicated.');
 const section=[
 '<section class="section" id="fortinet-solutions" aria-labelledby="fortinet-title"><div class="fortinet-home-grid"><div>',
 '<p class="eyebrow">Network security and infrastructure sourcing</p>',
 '<h2 id="fortinet-title">Fortinet solutions through Tri-Point</h2>',
 '<p>Tri-Point is a Fortinet Engage Advocate Partner. We help businesses, educational institutions and government buyers coordinate product and subscription inquiries, confirming the applicable partner scope and quotation terms for each requirement.</p>',
 '<p>Tell us the products, quantities, delivery locations and deadlines you need. Product availability and purchasing eligibility are confirmed before any offer.</p>',
 '<a class="button" href="'+FORTINET_ROUTE+'">Fortinet procurement inquiries</a>',
 '</div><div class="fortinet-home-art">'+fortinetBadge()+'</div></div></section>'
 ].join('');
 return html.replace(marker,section+marker).replace('</head>','<link rel="stylesheet" href="/assets/fortinet.css"></head>');
}
export function renderFortinetPage({preview=false}={}){
 const title='Fortinet Network Security Product Sourcing';
 const description='Request Fortinet product and subscription sourcing from Tri-Point Government Solutions LLC, Fortinet Engage Advocate Partner.';
 const schema={'@context':'https://schema.org','@type':'WebPage',name:title,url:SITE+FORTINET_ROUTE,description,about:{'@type':'Organization',name:COMPANY,address:BUSINESS_POSTAL_ADDRESS}};
 return [
 '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>'+title+' | Tri-Point</title><meta name="description" content="'+description+'">',
 '<meta name="robots" content="'+(preview?'noindex, nofollow':'index, follow')+'">',
 '<link rel="canonical" href="'+SITE+FORTINET_ROUTE+'"><meta property="og:type" content="website">',
 '<meta property="og:title" content="'+title+'"><meta property="og:description" content="'+description+'">',
 '<link rel="icon" href="/assets/tripoint-logo.svg" type="image/svg+xml">',
 '<link rel="stylesheet" href="/assets/network.css"><link rel="stylesheet" href="/assets/fortinet.css">',
 '<script type="application/ld+json">'+JSON.stringify(schema).replaceAll('<','\\u003c')+'</script></head><body>',
 '<a class="skip" href="#main">Skip to content</a><header class="site-header"><nav class="nav" aria-label="Main navigation">',
 '<a class="brand" href="/"><img src="/assets/tripoint-logo.svg" width="260" height="70" alt="Tri-Point Government Solutions"></a>',
 '<div class="nav-links"><a href="/">Agency capabilities</a><a href="/contractors">Subcontractor network</a><a href="/login">Sign in</a></div></nav></header>',
 '<main id="main" class="wrap"><section class="hero fortinet-hero"><div>',
 '<p class="eyebrow">Tri-Point Government Solutions LLC · Technology procurement</p>',
 '<h1>Fortinet sourcing for your organization.</h1>',
 '<p class="lead">Tri-Point participates in the Fortinet Engage Partner Program as an Advocate Partner. We assist with product identification, licensing inquiries and quotation coordination for organizational purchasing requirements.</p>',
 '<div class="actions"><a class="button" href="#inquiry">Request sourcing assistance</a><a class="button secondary" href="#needs">Information for a quote</a></div>',
 '<p class="fine">Eligibility, partner scope, stock, subscriptions, support terms and public procurement requirements are checked for each quotation.</p>',
 '</div><aside class="panel fortinet-partner-panel">'+fortinetBadge({lined:true})+'<p class="fine">Fortinet Engage Advocate Partner emblem supplied by Tri-Point. Tri-Point is an independent reseller, not Fortinet.</p></aside></section>',
 '<section class="section" id="needs"><h2>Share the requirements for your purchase.</h2>',
 '<p>Fortinet needs can involve network appliances, subscriptions, support and technical specifications. We review the exact scope before making an offer.</p>',
 '<div class="grid"><article class="card"><h3>Firewalls and network security</h3><p>Include your FortiGate model, quantity, specifications and delivery needs.</p></article>',
 '<article class="card"><h3>Switching and wireless</h3><p>Specify any FortiSwitch, FortiAP or related part numbers and compatibility requirements.</p></article>',
 '<article class="card"><h3>Licensing and renewals</h3><p>Provide subscription or renewal requirements through a suitable channel. Product authorization and licensing eligibility must be verified.</p></article></div></section>',
 '<section class="section" id="inquiry"><div class="callout"><p class="eyebrow">Fortinet procurement inquiry</p><h2>Request a sourcing review.</h2>',
 '<p>Send the organization, requested models or licensing requirements, quantities, delivery location and quotation deadline. Include the solicitation number if applicable. Do not email credentials or sensitive network details.</p>',
 '<a class="button" href="mailto:info@tripointgs.com?subject=Fortinet%20Product%20Sourcing%20Inquiry">Email Tri-Point about Fortinet</a>',
 '<p class="fine">This opens an email. It is not an order, guarantee of stock, quoted price, contract award or purchasing authorization for a particular product.</p></div></section>',
 '<section class="section"><p class="fine">Fortinet, FortiGate, FortiSwitch and FortiAP are trademarks of Fortinet, Inc. Advocate Partner status does not establish a higher partner tier, permission for every product, managed security services certification or implementation accreditation.</p></section>',
 '</main><footer><div class="wrap"><strong>'+COMPANY+'</strong><p><strong>Business address:</strong></p>'+BUSINESS_ADDRESS_HTML,
 '<p>Independent procurement and sourcing business. Not a government agency.</p><div class="footer-links"><a href="/">Home</a><a href="/contractors">Subcontractor network</a><a href="mailto:info@tripointgs.com">info@tripointgs.com</a></div>',
 '<p>&copy; 2026 '+COMPANY+'.</p></div></footer></body></html>'
 ].join('');
}
