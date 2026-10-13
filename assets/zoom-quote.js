const form=document.querySelector('#zoom-quote-form'),message=document.querySelector('#zoom-quote-message'),submit=document.querySelector('#zoom-quote-submit'),receipt=document.querySelector('#zoom-quote-receipt');
const endpoint='/api/zoom-quotes'+(form.dataset.review==='true'?'?review=1':'');
let challenge=null,pending=false;
const status=(value,error=false)=>{message.textContent=value;message.classList.toggle('error',error);};
async function initialize(){const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'});const result=await response.json();if(!response.ok||!result.challenge)throw Error(result.error||'This quote form is not available.');challenge=result.challenge;return result;}
initialize().catch(error=>{status(error.message,true);submit.disabled=true;});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(pending||!form.reportValidity())return;pending=true;submit.disabled=true;status('Saving your request…');
 try{
  if(!challenge){await initialize();throw Error('The secure form refreshed. Review your details and submit again.');}
  const data=new FormData(form),body={};
  for(const key of ['organization','contact','email','phone','organizationType','product','requestType','seats','currentProvider','renewalDate','solicitationNumber','quoteDeadline','deadlineTimezone','notes','faxNumber'])body[key]=String(data.get(key)||'');
  body.consent=data.get('consent')==='on';body.consentVersion='zoom-quote-contact-2026-10-12';body.challenge=challenge;
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
  if(!response.ok||!result.ok){if(response.status===400&&/refresh|expired/i.test(result.error||'')){challenge=null;await initialize();}throw Error(result.error||'The request was not saved. Please try again.');}
  form.hidden=true;receipt.replaceChildren();const heading=document.createElement('h3'),text=document.createElement('p'),reference=document.createElement('p');
  heading.textContent=result.isTest?'Private review test saved':'Your quote request was received';
  text.textContent=result.isTest?'This is a test record for staff review. No email, pricing approval or customer order was created.':'Tri-Point will review your requirements and contact you about the request. This confirmation is not a quotation, approved price or purchase commitment.';
  reference.textContent='Reference: '+result.id;receipt.append(heading,text,reference);receipt.hidden=false;receipt.focus();
 }catch(error){status(error.message||'Unable to save the inquiry. Please try again.',true);message.scrollIntoView({block:'center',behavior:'auto'});}
 finally{pending=false;submit.disabled=false;}
});
