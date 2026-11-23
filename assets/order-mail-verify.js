const $=id=>document.getElementById(id),q=new URLSearchParams(location.hash.slice(1));let token=q.getAll('verify').length===1&&[...q.keys()].every(k=>k==='verify')?q.get('verify'):null,busy=false;history.replaceState(null,'',location.pathname);window.addEventListener('hashchange',()=>location.reload());
function controls(){$('mv-confirm').disabled=busy||!token||!$('mv-consent').checked;$('mv-consent').disabled=busy;}controls();$('mv-consent').addEventListener('change',controls);$('mv-status').textContent=token?'Select the checkbox and Confirm email to use this link once.':'No verification link is available. Open the original verification email.';
$('mv-confirm').addEventListener('click', async () => {
 if ($('mv-confirm').disabled) return;
 busy = true;
 controls();
 const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
 try {
  // Deployment Protection needs its same-origin cookie. The app still requires the single-use token and consent.
  const response = await fetch('/api/shop?view=cart-checkout-mail-confirm', {
   method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
   referrerPolicy: 'origin', cache: 'no-store', signal: controller.signal,
   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, consent: true })
  });
  const result = await response.json();
  if (!response.ok || result.verified !== true || result.orderAccessGranted !== false)
   throw Error(result.error || 'Verification could not be confirmed.');
  $('mv-status').textContent = 'Mailbox confirmed for the private test notice. No order access, account, payment or supplier purchase was created.';
 } catch {
  $('mv-status').textContent = 'Verification could not be confirmed or the link was already used. Ask Tri-Point to check its saved status; no email was resent.';
 } finally {
  token = null;
  clearTimeout(timer);
  busy = false;
  controls();
 }
});
