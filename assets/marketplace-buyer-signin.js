import { buyerOrderIdPattern, checkoutReturnSelection, createBuyerCheckout } from './marketplace-buyer-checkout.js';
import { createLenovoDeliveryEstimate } from './marketplace-lenovo-delivery.js';

(() => {
  const preview = document.querySelector('main')?.dataset.marketplaceMode === 'preview';
  const status = document.getElementById('buyer-signin-status');
  const form = document.getElementById('buyer-signin-form');
  const actions = document.getElementById('buyer-signin-actions');
  const checkButton = document.getElementById('buyer-signin-check');
  const signOutButton = document.getElementById('buyer-signin-out');
  const retry = document.getElementById('buyer-signin-retry');
  const cartPanel = document.getElementById('buyer-cart');
  const cartSummary = document.getElementById('buyer-cart-summary');
  const cartStatus = document.getElementById('buyer-cart-status');
  const add = document.getElementById('buyer-cart-add');
  const remove = document.getElementById('buyer-cart-remove');
  const addProduct = document.getElementById('buyer-cart-add-product');
  const cartItems = document.getElementById('buyer-cart-items');
  const testProducts = addProduct ? new Map([...addProduct.options].map(option => [
    option.value, { partNumber: option.dataset.partNumber, quantity: Number(option.dataset.quantity) }
  ])) : null;
  const reload = document.getElementById('buyer-cart-reload');
  const saveReview = document.getElementById('buyer-review-save');
  const openReview = document.getElementById('buyer-review-open');
  const reviewId = document.getElementById('buyer-review-id');
  const reviewResult = document.getElementById('buyer-review-result');
  const reviewTitle = document.getElementById('buyer-review-title');
  const reviewSummary = document.getElementById('buyer-review-summary');
  const discardReview = document.getElementById('buyer-review-discard');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const accountUrl = new URL('/marketplace/account', window.location.origin).href;
  let clerk;
  let renderedSessionId;
  let mountedForm;
  let signOutPending = false;
  let verificationInFlight;
  let verifiedSessionId;
  let cartRequest;
  let cart;
  let savedId;
  let savedReview = null;
  let pendingReview;
  let deliveryEnabled = false;

  const checkout = preview ? createBuyerCheckout({ runRequest: runCart }) : null;
  const delivery = preview && document.getElementById('buyer-delivery-estimate') ? createLenovoDeliveryEstimate({ runRequest: runCart }) : null;
  function isSignUp(url) {
    return url.searchParams.getAll('flow').length === 1 && url.searchParams.get('flow') === 'sign-up';
  }
  function signUpUrl(returnUrl) {
    const url = new URL(returnUrl);
    url.searchParams.set('flow', 'sign-up');
    return url.href;
  }
  function signInReturnUrl() {
    if (!preview) return accountUrl;
    const current = new URL(window.location.href);
    if (isSignUp(current)) current.searchParams.delete('flow');
    const selection = checkoutReturnSelection(current);
    if (!selection) return accountUrl;
    const url = new URL(accountUrl);
    url.searchParams.set('order', selection.id);
    if (selection.canceled) url.searchParams.set('canceled', '1');
    return url.href;
  }

  const reviewStorageKey = sessionId => 'tripoint-preview-review:' + sessionId;
  const amount = cents => Number.isSafeInteger(cents) ? usd.format(cents / 100) : 'Pending';

  function rememberPendingReview() {
    try {
      sessionStorage.setItem(reviewStorageKey(verifiedSessionId), JSON.stringify({
        id: pendingReview.requestId, revision: pendingReview.revision
      }));
    } catch { /* The visible review ID is also available for manual recovery. */ }
  }

  function recoverPendingReview(sessionId) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(reviewStorageKey(sessionId)));
      if (typeof saved?.id !== 'string' || !buyerOrderIdPattern.test(saved.id) || !Number.isSafeInteger(saved.revision) || saved.revision < 0) return;
      pendingReview = { action: 'save', requestId: saved.id, revision: saved.revision, consent: true };
      displayPendingReview();
      cartControls();
    } catch { /* Storage is optional and never grants access. */ }
  }

  function forgetPendingReview(sessionId) {
    if (!preview || !sessionId) return;
    try { sessionStorage.removeItem(reviewStorageKey(sessionId)); } catch { /* Storage is optional. */ }
  }

  function displayPendingReview() {
    reviewId.value = pendingReview.requestId;
    reviewResult.hidden = false;
    reviewTitle.textContent = 'Review request';
    reviewSummary.textContent = 'Keep this review ID. If saving was interrupted, open the review, retry it, or discard it.';
  }

  function hasScenarioProducts(items) {
    return Array.isArray(items) && items.length === testProducts.size &&
      new Set(items.map(item => item?.sku)).size === testProducts.size && items.every(item => {
        const expected = testProducts.get(item?.sku);
        return expected && typeof item.partNumber === 'string' &&
          item.partNumber.trim().replace(/\s+/g, ' ').toUpperCase() === expected.partNumber && item.quantity === expected.quantity;
      });
  }

  function canReviewCart() {
    return testProducts ? hasScenarioProducts(cart?.items) : cart?.itemCount === 1;
  }

  function cartControls() {
    const busy = Boolean(cartRequest);
    const blocked = busy || !cart || Boolean(pendingReview);
    if (testProducts) {
      const added = new Set(cart?.items.map(item => item.sku));
      const options = [...addProduct.options];
      for (const option of options) option.disabled = added.has(option.value);
      if (!addProduct.value || added.has(addProduct.value)) {
        addProduct.selectedIndex = options.findIndex(option => !option.disabled);
      }
      addProduct.disabled = blocked || !addProduct.value;
      add.disabled = addProduct.disabled;
      for (const button of cartItems.querySelectorAll('button')) button.disabled = blocked;
    } else {
      add.disabled = blocked || canReviewCart();
      remove.disabled = blocked || !canReviewCart();
      remove.hidden = !canReviewCart();
    }
    reload.disabled = busy;
    saveReview.hidden = !canReviewCart() || Boolean(savedId);
    saveReview.querySelector('button').disabled = busy;
    saveReview.querySelector('button').textContent = pendingReview ? 'Retry saving this review' : 'Save checkout review';
    openReview.querySelector('button').disabled = busy;
    discardReview.disabled = busy || !(savedId || pendingReview);
    checkout.controls({ busy, review: savedReview });
    delivery?.controls({ enabled: deliveryEnabled, busy, cart });
  }

  function clearCart() {
    verifiedSessionId = undefined;
    if (!preview) return;
    cartRequest?.abort();
    cartRequest = undefined;
    cart = undefined;
    savedId = undefined;
    savedReview = null;
    pendingReview = undefined;
    checkout.reset();
    deliveryEnabled = false;
    delivery?.reset();
    cartPanel.hidden = true;
    reviewResult.hidden = true;
    cartSummary.textContent = '';
    if (cartItems) {
      cartItems.replaceChildren();
      cartItems.hidden = true;
    }
    cartStatus.textContent = '';
    reviewTitle.textContent = '';
    reviewSummary.textContent = '';
    openReview.reset();
    saveReview.reset();
    cartControls();
  }

  async function accountRequest(session, view, signal, { id, cursor, data } = {}) {
    const token = await session.getToken();
    if (!token) throw Object.assign(new Error('Your sign-in expired.'), { status: 401 });
    signal.throwIfAborted();
    const query = new URLSearchParams({ view, ...(id ? { id } : {}), ...(cursor ? { cursor } : {}) });
    const response = await fetch('/api/shop?' + query, {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
      headers: { Authorization: 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      ...(data ? { method: 'POST', body: JSON.stringify(data) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result?.error || 'The account request could not be completed.'), { status: response.status });
    return result;
  }

  async function runCart(view, options, display, requestStatus = cartStatus) {
    const session = clerk.session;
    if (!session || session.id !== verifiedSessionId || cartRequest || signOutPending) return;
    const controller = new AbortController();
    cartRequest = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);
    cartControls();
    requestStatus.textContent = 'Checking the private preview…';
    try {
      const result = await accountRequest(session, view, controller.signal, options);
      if (!controller.signal.aborted && clerk.session?.id === session.id) display(result);
    } catch (error) {
      if (clerk.session?.id !== session.id || cartRequest !== controller) return;
      if (timedOut) {
        requestStatus.textContent = 'The request timed out. Check the same cart, review or order before trying again.';
        return;
      }
      if (controller.signal.aborted) return;
      if (error.status === 401 || error.status === 403) {
        clearCart();
        status.textContent = 'Verify your marketplace sign-in to use the cart.';
        return;
      }
      requestStatus.textContent = error.message || 'The private marketplace request could not be checked.';
    } finally {
      clearTimeout(timer);
      if (cartRequest === controller) {
        cartRequest = undefined;
        cartControls();
      }
    }
  }

  function validScenarioCart(result) {
    const { items, itemCount } = result;
    if (!Array.isArray(items) || items.length > 20) return false;
    const seen = new Set();
    let quantity = 0;
    for (const item of items) {
      if (typeof item?.sku !== 'string' || !/^[1-9]\d{0,11}$/.test(item.sku) || seen.has(item.sku) ||
          typeof item.partNumber !== 'string' || !item.partNumber.trim() || item.partNumber.length > 110 ||
          typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 ||
          !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999 ||
          (item.lineTotalCents !== null && (!Number.isSafeInteger(item.lineTotalCents) || item.lineTotalCents < 0))) return false;
      seen.add(item.sku);
      quantity += item.quantity;
    }
    return itemCount === quantity;
  }

  function renderCartItems(items) {
    const rows = items.map(item => {
      const row = document.createElement('li');
      const removeItem = document.createElement('button');
      removeItem.type = 'button';
      removeItem.textContent = 'Remove';
      removeItem.setAttribute('aria-label', 'Remove ' + item.title);
      removeItem.addEventListener('click', () => void changeCart('remove', item.sku));
      row.append(document.createTextNode(item.quantity + ' × ' + item.title + ' · ' + item.partNumber +
        ' · ' + amount(item.lineTotalCents) + ' '), removeItem);
      return row;
    });
    cartItems.replaceChildren(...rows);
    cartItems.hidden = rows.length === 0;
  }

  function showCart(result) {
    if (result?.preview !== true || result.checkoutEnabled !== false ||
        !Number.isSafeInteger(result.revision) || result.revision < 0 ||
        (testProducts ? !validScenarioCart(result) : ![0, 1].includes(result.itemCount))) {
      throw new Error('The cart could not be verified.');
    }
    if (cart && cart.revision !== result.revision && savedReview && !savedReview.needsRecheck) {
      savedReview = { ...savedReview, needsRecheck: true };
      reviewSummary.textContent = 'This review needs a fresh cart check.';
    }
    cart = result;
    const cartLabel = testProducts ? 'Item subtotal' : 'One Lenovo desktop';
    cartSummary.textContent = result.itemCount === 0 ? 'Your test cart is empty.' :
      cartLabel + ' · ' + amount(result.subtotalCents) + ' · Estimated delivery ' + amount(result.deliveryEstimateCents);
    if (cartItems) renderCartItems(result.items);
    cartStatus.textContent = result.notice || '';
  }

  function showReview(result, expectedId) {
    if (result?.id !== expectedId || result.preview !== true || result.canPay !== false) throw new Error('The review could not be verified.');
    savedId = result.id;
    savedReview = { ...result, needsRecheck: result.needsRecheck || !Number.isSafeInteger(result.subtotalCents) ||
      !Number.isSafeInteger(result.deliveryEstimateCents) || Boolean(testProducts && !hasScenarioProducts(result.items)) };
    if (pendingReview?.requestId === savedId) {
      forgetPendingReview(verifiedSessionId);
      pendingReview = undefined;
    }
    reviewId.value = savedId;
    reviewResult.hidden = false;
    reviewTitle.textContent = result.reference;
    reviewSummary.textContent = savedReview.needsRecheck ? 'This review needs a fresh cart check.' :
      amount(result.subtotalCents) + ' in products · Estimated delivery ' + amount(result.deliveryEstimateCents) + ' · Tax not yet calculated';
    cartStatus.textContent = 'Private test review loaded.';
  }

  const getCart = () => runCart('marketplace-buyer-cart', {}, showCart);
  const changeCart = (action, sku) => {
    if (!cart) return;
    return runCart('marketplace-buyer-cart', { data: { action, revision: cart.revision, ...(sku ? { sku } : {}) } }, showCart);
  };

  function bindCartActions() {
    add.addEventListener('click', () => void changeCart('add', addProduct?.value));
    remove?.addEventListener('click', () => void changeCart('remove'));
    reload.addEventListener('click', () => void (cart?.needsRefresh ? changeCart('refresh') : getCart()));
    saveReview.addEventListener('submit', event => {
      event.preventDefault();
      if (cartRequest || !canReviewCart() || !saveReview.elements.consent.checked) return;
      if (!pendingReview) {
        pendingReview = { action: 'save', requestId: crypto.randomUUID(), revision: cart.revision, consent: true };
        rememberPendingReview();
      }
      const request = pendingReview;
      displayPendingReview();
      void runCart('marketplace-buyer-review', { data: request }, result => showReview(result, request.requestId));
    });
    openReview.addEventListener('submit', event => {
      event.preventDefault();
      if (cartRequest) return;
      const id = reviewId.value.trim().toLowerCase();
      if (pendingReview && pendingReview.requestId !== id) {
        cartStatus.textContent = 'Open or discard the pending review before switching to another one.';
        return;
      }
      void runCart('marketplace-buyer-review', { id }, result => showReview(result, id));
    });
    discardReview.addEventListener('click', () => {
      const id = savedId || pendingReview?.requestId;
      if (!id) return;
      void runCart('marketplace-buyer-review', { data: { action: 'discard', id } }, result => {
        if (result?.discarded !== true) throw new Error('The review discard could not be verified.');
        savedId = undefined;
        savedReview = null;
        if (pendingReview?.requestId === id) {
          forgetPendingReview(verifiedSessionId);
          pendingReview = undefined;
        }
        reviewResult.hidden = true;
        openReview.reset();
        saveReview.reset();
        cartStatus.textContent = 'The private review was discarded.';
      });
    });
  }

  function cancelVerification() {
    verificationInFlight?.abort();
    verificationInFlight = undefined;
    checkButton.disabled = false;
  }

  async function checkSession() {
    const session = clerk.session;
    if (!session || signOutPending) return;
    cancelVerification();
    const controller = new AbortController();
    verificationInFlight = controller;
    checkButton.disabled = true;
    status.textContent = 'Checking your sign-in…';

    try {
      const result = await accountRequest(session, 'marketplace-buyer-session', controller.signal);
      if (controller.signal.aborted || clerk.session?.id !== session.id) return;
      if (result?.signedIn !== true || result.emailVerified !== true || typeof result.paymentEnabled !== 'boolean') {
        throw new Error('Unexpected sign-in status');
      }
      status.textContent = preview ? 'Your email and marketplace sign-in are verified for this preview.' :
        'Your email is verified. You’re signed in to the marketplace.';
      verifiedSessionId = session.id;
      if (!preview) return;
      deliveryEnabled = result.deliveryEnabled === true;
      cartPanel.hidden = false;
      if (!pendingReview) recoverPendingReview(session.id);
      await getCart();
      if (!controller.signal.aborted && verifiedSessionId === session.id) {
        await checkout.activate(result.paymentEnabled, checkoutReturnSelection(new URL(signInReturnUrl())));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        clearCart();
        if (error.status === 401) status.textContent = 'Your sign-in expired. Sign out and sign in again.';
        else if (error.status === 403) status.textContent = 'Verify your account email, then check your sign-in again.';
        else status.textContent = 'Tri-Point could not verify your sign-in right now. Try checking again.';
      }
    } finally {
      if (verificationInFlight === controller) {
        verificationInFlight = undefined;
        checkButton.disabled = false;
      }
    }
  }

  function renderSession() {
    const currentId = clerk.session?.id ?? null;
    if (currentId === renderedSessionId) return;
    forgetPendingReview(renderedSessionId);
    renderedSessionId = currentId;
    cancelVerification();
    clearCart();

    if (currentId) {
      if (mountedForm) {
        if (mountedForm === 'sign-up') clerk.unmountSignUp(form);
        else clerk.unmountSignIn(form);
        mountedForm = undefined;
      }
      form.hidden = true;
      actions.hidden = false;
      void checkSession();
      return;
    }

    actions.hidden = true;
    form.hidden = false;
    status.textContent = preview ? 'Sign in or create a test account to continue.' : 'Sign in or create a marketplace account.';
    const returnUrl = signInReturnUrl();
    if (isSignUp(new URL(window.location.href))) {
      clerk.mountSignUp(form, { routing: 'hash', signInUrl: returnUrl, forceRedirectUrl: returnUrl });
      mountedForm = 'sign-up';
    } else {
      clerk.mountSignIn(form, { routing: 'hash', signUpUrl: signUpUrl(returnUrl),
        forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl });
      mountedForm = 'sign-in';
    }
  }

  async function signOut() {
    if (signOutPending) return;
    const sessionId = clerk.session?.id;
    signOutPending = true;
    cancelVerification();
    clearCart();
    checkButton.disabled = true;
    signOutButton.disabled = true;
    status.textContent = 'Signing out…';
    try {
      await clerk.signOut({ redirectUrl: accountUrl });
      forgetPendingReview(sessionId);
      window.location.assign(accountUrl);
    } catch {
      signOutPending = false;
      checkButton.disabled = false;
      signOutButton.disabled = false;
      status.textContent = 'Sign-out could not be confirmed. Try again.';
      renderSession();
    }
  }

  async function initialize() {
    try {
      clerk = window.Clerk;
      const returnUrl = signInReturnUrl();
      await clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor },
        signInUrl: returnUrl,
        signUpUrl: signUpUrl(returnUrl),
        signInForceRedirectUrl: returnUrl,
        signUpForceRedirectUrl: returnUrl
      });
      checkButton.addEventListener('click', () => void checkSession());
      signOutButton.addEventListener('click', () => void signOut());
      if (preview) bindCartActions();
      window.addEventListener('pagehide', () => { cancelVerification(); clearCart(); });
      window.addEventListener('pageshow', event => { if (event.persisted) void checkSession(); });
      renderSession();
      clerk.addListener(renderSession, { skipInitialEmit: true });
    } catch {
      cancelVerification();
      form.hidden = true;
      actions.hidden = true;
      status.textContent = 'Sign-in could not load. Reload this page to try again.';
      retry.hidden = false;
    }
  }

  void initialize();
})();