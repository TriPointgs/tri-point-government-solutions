import assert from 'node:assert/strict';
import test from 'node:test';
import { marketplaceCustomerPage } from '../lib/marketplace-customer-page.mjs';
import { quoteMarketplace } from '../lib/quote-marketplace.mjs';

test('the production customer page loads Clerk from its issuer and keeps account controls private', () => {
  const page = marketplaceCustomerPage({ issuer: 'https://clerk.tripointgs.com', publishableKey: 'pk_live_synthetic' });
  assert.match(page, /meta name="robots" content="noindex, nofollow"/);
  assert.match(page, /src="https:\/\/clerk\.tripointgs\.com\/npm\/@clerk\/clerk-js@6\/dist\/clerk\.browser\.js"/);
  assert.match(page, /src="\/assets\/marketplace-customer-auth\.js"/);
  assert.match(page, /id="customer-auth-status" role="status"/);
  assert.match(page, /id="customer-auth-actions" hidden/);
  assert.match(page, /href="\/marketplace">Back to marketplace/);
  assert.doesNotMatch(page, /stripe|checkout|cart|tax|shipping/i);
});

test('the account page escapes publisher values inside attributes', () => {
  const page = marketplaceCustomerPage({
    issuer: 'https://fictional.invalid/"<site>',
    publishableKey: 'pk_live_synthetic" onload="something'
  });
  assert.match(page, /https:\/\/fictional\.invalid\/&quot;&lt;site&gt;\/npm\//);
  assert.match(page, /data-clerk-publishable-key="pk_live_synthetic&quot; onload=&quot;something"/);
  assert.doesNotMatch(page, / onload="/);
});

test('the quote marketplace adds one customer link only when requested and keeps quote and staff access links', () => {
  const accountLink = /href="\/marketplace\/account">Marketplace customer sign in<\/a>/g;
  assert.equal((quoteMarketplace().match(accountLink) || []).length, 0);
  assert.equal((quoteMarketplace({ customerSignInEnabled: 'true' }).match(accountLink) || []).length, 0);
  const page = quoteMarketplace({ customerSignInEnabled: true });
  assert.equal((page.match(accountLink) || []).length, 1);
  assert.match(page, /href="#quote-picker">Build your quote request/);
  assert.match(page, /href="\/contact">Talk through a project/);
  assert.match(page, /href="\/contact\?fromList=1">Continue to quote request/);
  assert.match(page, /href="\/login"/);
  assert.doesNotMatch(page, /checkout\.stripe\.com|Add to cart|Pay now|Buy now/);
});
