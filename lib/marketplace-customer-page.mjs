const escapeAttribute = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function marketplaceCustomerPage({ issuer, publishableKey }) {
  const clerk = escapeAttribute(issuer);
  const key = escapeAttribute(publishableKey);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>Marketplace account | Tri-Point</title>
  <link rel="stylesheet" href="/assets/marketplace-customer-auth.css">
  <script defer crossorigin="anonymous" src="${clerk}/npm/@clerk/ui@1/dist/ui.browser.js"></script>
  <script defer crossorigin="anonymous" data-clerk-publishable-key="${key}" src="${clerk}/npm/@clerk/clerk-js@6/dist/clerk.browser.js"></script>
  <script type="module" src="/assets/marketplace-customer-auth.js"></script>
</head>
<body class="marketplace-account">
  <header class="marketplace-account-header">
    <a href="/" aria-label="Tri-Point home"><img src="/assets/tripoint-logo.svg" width="220" height="45" alt="Tri-Point Government Solutions"></a>
    <nav aria-label="Marketplace"><a href="/marketplace">Back to marketplace</a></nav>
  </header>
  <main class="marketplace-account-main">
    <h1>Marketplace account</h1>
    <p id="customer-auth-intro">Sign in or create a marketplace account with your email.</p>
    <p id="customer-auth-status" role="status" aria-atomic="true">Loading sign-in…</p>
    <div id="customer-auth-form" hidden></div>
    <div id="customer-auth-actions" hidden>
      <button type="button" id="customer-auth-check" hidden>Check sign-in again</button>
      <button type="button" id="customer-auth-signout">Sign out</button>
    </div>
    <a href="/marketplace/account" id="customer-auth-retry" hidden>Reload sign-in</a>
    <noscript><p>Enable JavaScript to use marketplace sign-in.</p></noscript>
    <p class="marketplace-account-privacy"><a href="/privacy">Privacy policy</a></p>
  </main>
</body>
</html>`;
}
