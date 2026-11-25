// Run npm run test:browser after npm ci. Requires installed Chrome, or set
// PLAYWRIGHT_CHANNEL to another installed Playwright browser channel, such as msedge.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from 'playwright-core';
import {contactPage} from '../../lib/contact-page.mjs';
import {quoteMarketplace} from '../../lib/quote-marketplace.mjs';

const description = 'Example · Synthetic notebook';
const fixture = [{
  brand: 'Example', name: 'Synthetic notebook', category: 'laptops',
  description, image: '/assets/synthetic-product.svg',
}];
const assetRoot = new URL('../../assets/', import.meta.url);

async function openBuyerPage(t) {
  const writes = [];
  const externalRequests = [];
  // Serve real page generators and browser modules, with no production API handlers.
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method !== 'GET') {
      writes.push(request.method + ' ' + url.pathname);
      response.writeHead(405).end();
      return;
    }
    const pages = {'/marketplace': quoteMarketplace, '/contact': contactPage};
    if (pages[url.pathname]) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(pages[url.pathname]());
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/assets/quote-options.json') {
      response.end(JSON.stringify(fixture));
      return;
    }
    if (url.pathname === '/api/contact') {
      response.end(JSON.stringify({enabled: false, preview: true, challenge: null}));
      return;
    }
    if (url.pathname === '/assets/synthetic-product.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>');
      return;
    }
    const asset = new URL('.' + url.pathname.replace(/^\/assets/, ''), assetRoot);
    if (url.pathname.startsWith('/assets/') && asset.href.startsWith(assetRoot.href)) {
      try {
        const bytes = await readFile(fileURLToPath(asset));
        response.setHeader('Content-Type', asset.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(bytes);
        return;
      } catch {
        // Unused presentation assets may be absent from the local fixture.
      }
    }
    response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true});
  t.after(() => browser.close());
  const context = await browser.newContext({serviceWorkers: 'block'});
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) {
      externalRequests.push(request.url());
      await route.abort();
    } else if (request.method() !== 'GET') {
      writes.push(request.method() + ' ' + new URL(request.url()).pathname);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  t.after(() => {
    assert.deepEqual(writes, [], 'The buyer test must make no write requests');
    assert.deepEqual(externalRequests, [], 'The buyer test must make no external requests');
  });
  const page = await context.newPage();
  await page.goto(origin + '/marketplace');
  await page.getByRole('checkbox', {name: 'Select ' + description, exact: true}).waitFor();
  return page;
}

async function typeQuantity(page, name, value) {
  const input = page.getByRole('spinbutton', {name, exact: true});
  await input.click();
  await input.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await input.pressSequentially(String(value));
  // Real focus loss commits the number input's change event.
  await page.getByRole('heading', {name: 'Your selected items', exact: true}).click();
}

test('buyer quantity edit survives navigation to the quote form and reload', {timeout: 30000}, async t => {
  const page = await openBuyerPage(t);
  await page.getByRole('checkbox', {name: 'Select ' + description, exact: true}).check();
  const quantityName = 'Quantity for ' + description;
  await typeQuantity(page, quantityName, 9999);
  await page.getByRole('link', {name: 'Continue to quote request', exact: true}).click();
  assert.equal(await page.getByRole('spinbutton', {name: quantityName, exact: true}).inputValue(), '9999');
  await page.reload();
  assert.equal(await page.getByRole('spinbutton', {name: quantityName, exact: true}).inputValue(), '9999');
  assert.equal(await page.getByRole('list', {name: 'Selected quote items'}).getByRole('spinbutton').count(), 1);
  await page.getByRole('button', {name: 'Save preview request', exact: false}).waitFor();
  assert.equal(await page.getByRole('button', {name: 'Save preview request', exact: false}).isEnabled(), false);
});

test('buyer duplicate overflow preserves the original quantity after reload', {timeout: 30000}, async t => {
  const page = await openBuyerPage(t);
  await page.getByRole('checkbox', {name: 'Select ' + description, exact: true}).check();
  await typeQuantity(page, 'Quantity for ' + description, 9999);
  await page.getByRole('textbox', {name: 'Another item or part number', exact: true}).fill(description);
  await page.getByRole('spinbutton', {name: 'Quantity', exact: true}).fill('1');
  await page.getByRole('button', {name: 'Add item', exact: true}).click();
  assert.equal(await page.getByText('The combined quantity cannot exceed 9999.', {exact: true}).isVisible(), true);
  assert.equal(await page.getByRole('spinbutton', {name: 'Quantity for ' + description, exact: true}).inputValue(), '9999');
  await page.reload();
  assert.equal(await page.getByRole('spinbutton', {name: 'Quantity for ' + description, exact: true}).inputValue(), '9999');
  assert.equal(await page.getByRole('list', {name: 'Selected quote items'}).getByRole('spinbutton').count(), 1);
});
