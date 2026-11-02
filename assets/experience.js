(()=>{
 const toggle=document.querySelector('.experience-menu-toggle'),nav=document.querySelector('#experience-nav');
 if(toggle&&nav){
  toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav.classList.toggle('is-open',open);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const wasOpen=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open');document.querySelectorAll('.experience-mega[open]').forEach(d=>d.open=false);if(wasOpen)toggle.focus();}});
  nav.addEventListener('click',e=>{if(e.target.closest('a')){toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open');}});
 }
 document.addEventListener('click',e=>document.querySelectorAll('.experience-mega[open]').forEach(d=>{if(!d.contains(e.target))d.open=false;}));
})();
