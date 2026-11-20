const status = document.getElementById('customer-auth-status');
const intro = document.getElementById('customer-auth-intro');
const form = document.getElementById('customer-auth-form');
const actions = document.getElementById('customer-auth-actions');
const checkButton = document.getElementById('customer-auth-check');
const signOutButton = document.getElementById('customer-auth-signout');
const reloadLink = document.getElementById('customer-auth-retry');

const accountUrl = new URL('/marketplace/account', window.location.origin).href;
const signUpUrl = new URL('?flow=sign-up', accountUrl).href;
const appearance = { elements: { rootBox: 'marketplace-clerk-root', cardBox: 'marketplace-clerk-card' } };

let clerk;
let renderedSessionId;
let mounted;
let inFlight;
let signingOut = false;

function cancelVerification() {
  inFlight?.abort();
  inFlight = undefined;
  checkButton.disabled = false;
}

async function checkSession() {
  const session = clerk.session;
  if (!session || signingOut) return;
  cancelVerification();
  const controller = new AbortController();
  inFlight = controller;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
  checkButton.disabled = true;
  status.textContent = 'Checking your sign-in…';

  try {
    const token = await session.getToken();
    signal.throwIfAborted();
    if (!token) throw Object.assign(new Error('Sign-in expired'), { status: 401 });
    const response = await fetch('/api/marketplace/account-session', {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!response.ok) throw Object.assign(new Error('Session could not be verified'), { status: response.status });
    const result = await response.json();
    if (controller.signal.aborted || clerk.session?.id !== session.id) return;
    if (result?.signedIn !== true || result.emailVerified !== true || result.paymentEnabled !== false) {
      throw new Error('Unexpected session status');
    }
    status.textContent = 'Your marketplace account is signed in and your email is verified.';
    checkButton.hidden = true;
    if (window.location.search || window.location.hash) window.history.replaceState(null, '', accountUrl);
  } catch (error) {
    if (controller.signal.aborted || clerk.session?.id !== session.id) return;
    checkButton.hidden = false;
    if (error.status === 401) status.textContent = 'Your sign-in expired. Sign out and sign in again.';
    else if (error.status === 403) status.textContent = 'Verify your account email, then check your sign-in again.';
    else status.textContent = 'Tri-Point could not verify your sign-in right now. Try checking again.';
  } finally {
    if (inFlight === controller) {
      inFlight = undefined;
      checkButton.disabled = false;
    }
  }
}

function renderSession() {
  if (signingOut) return;
  const sessionId = clerk.session?.id ?? null;
  if (sessionId === renderedSessionId) return;
  renderedSessionId = sessionId;
  cancelVerification();

  intro.hidden = Boolean(sessionId);
  actions.hidden = !sessionId;
  checkButton.hidden = true;

  if (sessionId) {
    if (mounted === 'sign-up') clerk.unmountSignUp(form);
    if (mounted === 'sign-in') clerk.unmountSignIn(form);
    mounted = undefined;
    form.hidden = true;
    void checkSession();
    return;
  }

  form.hidden = false;
  status.textContent = '';
  if (new URL(window.location.href).searchParams.get('flow') === 'sign-up') {
    clerk.mountSignUp(form, { routing: 'hash', signInUrl: accountUrl, forceRedirectUrl: accountUrl, appearance });
    mounted = 'sign-up';
  } else {
    clerk.mountSignIn(form, {
      routing: 'hash', signUpUrl, forceRedirectUrl: accountUrl, signUpForceRedirectUrl: accountUrl, appearance
    });
    mounted = 'sign-in';
  }
}

async function signOut() {
  if (signingOut) return;
  signingOut = true;
  cancelVerification();
  checkButton.disabled = true;
  signOutButton.disabled = true;
  status.textContent = 'Signing out…';
  try {
    await clerk.signOut({ redirectUrl: accountUrl });
    window.location.assign(accountUrl);
  } catch {
    signingOut = false;
    checkButton.disabled = false;
    checkButton.hidden = false;
    signOutButton.disabled = false;
    status.textContent = 'Sign-out could not be confirmed. Try again.';
  }
}

async function initialize() {
  try {
    clerk = window.Clerk;
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      signInUrl: accountUrl,
      signUpUrl,
      signInForceRedirectUrl: accountUrl,
      signUpForceRedirectUrl: accountUrl
    });
    checkButton.addEventListener('click', () => void checkSession());
    signOutButton.addEventListener('click', () => void signOut());
    window.addEventListener('pagehide', cancelVerification);
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      const sessionId = clerk.session?.id ?? null;
      if (sessionId !== renderedSessionId) renderSession();
      else if (sessionId) void checkSession();
    });
    renderSession();
    clerk.addListener(renderSession, { skipInitialEmit: true });
  } catch {
    cancelVerification();
    form.hidden = true;
    actions.hidden = true;
    status.textContent = 'Sign-in could not load. Reload this page to try again.';
    reloadLink.hidden = false;
  }
}

void initialize();
