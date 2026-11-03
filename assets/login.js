const staff=document.querySelector('#staff-login'),contractor=document.querySelector('#contractor-login'),message=document.querySelector('#login-message');
function status(text,error=false){message.textContent=text;message.classList.toggle('error',error);}
async function auth(body){
 const response=await fetch('/api/contractor-auth',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Sign-in failed.');return data;
}
staff.addEventListener('submit',async event=>{
 event.preventDefault();const button=staff.querySelector('button');button.disabled=true;
 try{
  const response=await fetch('/api/admin',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',password:staff.elements.password.value})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Administrator sign-in failed.');
  staff.reset();location.assign('/contractors/admin');
 }catch(e){status(e.message,true);}finally{button.disabled=false;}
});
contractor.addEventListener('submit',async event=>{
 event.preventDefault();const button=contractor.querySelector('button');button.disabled=true;
 try{const result=await auth({action:'request',email:contractor.elements.email.value});status(result.message);contractor.reset();}
 catch(e){status(e.message,true);}finally{button.disabled=false;}
});
async function initialize(){
 const claim=new URLSearchParams(location.hash.slice(1)).get('claim');
 if(claim){history.replaceState(null,'',location.pathname);status('Verifying your one-time profile link…');try{await auth({action:'verify',token:claim});location.replace('/contractors/account');}catch(e){status(e.message,true);}}
 try{
  const response=await fetch('/api/contractor-auth',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('Sign-in availability could not be checked.');
  {
   const data=await response.json();
   if(typeof data.enabled!=='boolean')throw new Error('Sign-in availability was not confirmed.');
   contractor.querySelector('button').disabled=!data.enabled;
   if(!data.enabled)document.querySelector('#contractor-availability').textContent='Email sign-in is not currently available. For profile changes, email info@tripointgs.com from your application contact address.';
   if(data.enabled)document.querySelector('#contractor-availability').textContent='Enter your application email above to request a private sign-in link.';
   if(data.enabled&&data.signedIn&&!claim)document.querySelector('#contractor-availability').textContent='You already have a profile session. Open your company profile below.';
  }
 }catch{
  contractor.querySelector('button').disabled=true;
  document.querySelector('#contractor-availability').textContent='Email sign-in is temporarily unavailable. Please try again or email info@tripointgs.com for help.';
  status('Unable to check contractor sign-in availability. Administrator sign-in remains available.',true);
 }
}
initialize();
