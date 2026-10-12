const form=document.getElementById('equipment-quote-form');
const category=document.getElementById('equipment-quote-category');
for(const b of document.querySelectorAll('[data-equipment-category]')){
  b.addEventListener('click',()=>{
    category.value=b.getAttribute('data-equipment-category');
    document.getElementById('equipment-request').scrollIntoView({behavior:'smooth'});
    category.focus({preventScroll:true});
  });
}
form?.addEventListener('submit',event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  const f=new FormData(form);
  const take=k=>String(f.get(k)||'').trim();
  const text=[
    'Equipment quotation request',
    'Company: '+take('company'),
    'Contact email: '+take('email'),
    'Buyer type: '+take('buyerType'),
    'Category: '+take('category'),
    'Manufacturer / part number(s): '+take('partNumbers'),
    'Quantity: '+take('quantity'),
    'Requirements: '+take('requirements'),
    'Delivery ZIP: '+take('deliveryZip'),
    'Deadline: '+take('deadline')
  ].join('\n');
  const url='mailto:info@tripointgs.com?subject='+encodeURIComponent('Equipment RFQ - '+take('company'))+'&body='+encodeURIComponent(text);
  const status=document.getElementById('equipment-quote-status');
  if(url.length>4000){
    status.textContent='Your request is too long for an email link. Please send your requirements directly to info@tripointgs.com.';
    return;
  }
  status.textContent='Your email application should open. Review and send the email to complete your request; no information has been submitted by this website.';
  window.location.href=url;
});
