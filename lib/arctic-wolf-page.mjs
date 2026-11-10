import {readFileSync} from 'node:fs';
import {brandSolutionsPage} from './brand-solutions-page.mjs';

export function arcticWolfPage(){
 const path=new URL('../content/arctic-wolf/catalog.json',import.meta.url);
 return brandSolutionsPage('arctic-wolf',JSON.parse(readFileSync(path,'utf8')));
}

export function injectArcticWolfHome(html){
 const marker='<section id="contact"';
 if(!html.includes('id="fortinet-solutions"')||!html.includes(marker)||html.includes('id="arctic-wolf-solutions"')){
  throw Error('Arctic Wolf homepage placement changed or duplicated.');
 }
 const path=new URL('../content/arctic-wolf/catalog.json',import.meta.url);
 const {partnerBadge}=JSON.parse(readFileSync(path,'utf8'));
 const section=[
  '<section class="section" id="arctic-wolf-solutions" aria-labelledby="arctic-wolf-title">',
  '<div class="arctic-home-grid"><div>',
  '<p class="eyebrow">Managed cybersecurity</p>',
  '<h2 id="arctic-wolf-title">Arctic Wolf solutions through Tri-Point</h2>',
  '<p>Explore managed threat monitoring, exposure management, and incident response. Tri-Point can help scope services around your current tools and coverage needs.</p>',
  '<a class="button" href="/solutions/arctic-wolf">Explore Arctic Wolf solutions</a>',
  `</div><div class="arctic-home-badge"><img src="${partnerBadge}" alt="Arctic Wolf Bronze Pack Partner" width="608" height="222" loading="lazy" decoding="async"></div>`,
  '</div></section>'
 ].join('');
 return html.replace(marker,section+marker).replace('</head>','<link rel="stylesheet" href="/assets/brands/arctic-wolf/home.css"></head>');
}
