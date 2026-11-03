const params=new URLSearchParams(location.search),brand=params.get('manufacturer'),product=params.get('product');
if(['Wasabi','PTZOptics'].includes(brand)){
 const valid=typeof product==='string'&&product.length>0&&product.length<=160&&!/[\x00-\x1f\x7f]/.test(product);
 const name=valid?product:brand+' solution';
 const selection=document.getElementById('brand-inquiry-selection'),title=document.getElementById('brand-inquiry-name'),email=document.getElementById('contact-email-link');
 if(selection&&title&&email){title.textContent=name;selection.hidden=false;const subject=brand+' requirement: '+name,body='Hello Tri-Point,\n\nI would like to discuss '+name+'.\n\nQuantity or capacity:\nApplication and requirements:\nDelivery location:\nTiming:\n';email.href='mailto:info@tripointgs.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);}
}
