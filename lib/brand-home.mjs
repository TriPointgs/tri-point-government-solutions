export function brandHomeBadges(){
 const brands=[
  {id:'zoom',name:'Zoom',image:'/assets/brands/zoom/zoom-logo-2025.png',width:1426,height:321,title:'Collaboration that connects your team.',description:'Discuss your organization’s meeting and collaboration requirements with Tri-Point.',href:'/contact?manufacturer=Zoom',action:'Contact us for a quote'},
  {id:'ptzoptics',name:'PTZOptics',image:'/assets/brands/ptzoptics/ptzoptics-logo.svg',width:600,height:100,title:'Video for every kind of gathering.',description:'Explore cameras, control, and production tools for education, government, houses of worship, and live events.',href:'/solutions/ptzoptics',action:'Explore PTZOptics solutions'},
  {id:'wasabi',name:'Wasabi',image:'/assets/brands/wasabi/wasabi-logo.webp',width:1100,height:329,title:'Give your data room to grow.',description:'Plan cloud storage, backup, file, and video workflows around your organization’s needs.',href:'/solutions/wasabi',action:'Explore Wasabi solutions'}
 ];
 return `<section class="section brand-home-badges" id="technology-brands" aria-labelledby="technology-brands-title"><div class="brand-home-heading"><p class="eyebrow">TECHNOLOGY SOLUTIONS</p><h2 id="technology-brands-title">Explore more with Tri-Point.</h2><p>Connect the right products and services to your next requirement. Contact our team for guidance and a quote.</p></div><div class="brand-home-grid">${brands.map(b=>`<article class="brand-home-card" data-home-brand="${b.id}"><a class="brand-home-logo" href="${b.href}" aria-label="${b.name} solutions through Tri-Point"><img src="${b.image}" alt="${b.name}" width="${b.width}" height="${b.height}" loading="lazy" decoding="async"></a><div><h3>${b.title}</h3><p>${b.description}</p><a class="brand-home-link" href="${b.href}">${b.action} <span aria-hidden="true">↗</span></a></div></article>`).join('')}</div></section>`;
}
export function injectBrandHomeBadges(html){
 const marker='<section class="section" id="lenovo-solutions"';
 if(!html.includes(marker)||html.includes('id="technology-brands"'))throw Error('Homepage brand placement changed or duplicated.');
 return html.replace(marker,brandHomeBadges()+marker).replace('</head>','<link rel="stylesheet" href="/assets/brand-home.css"></head>');
}
