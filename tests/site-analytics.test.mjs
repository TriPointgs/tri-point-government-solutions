import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createContext, runInContext} from 'node:vm';

const analyticsScript = readFileSync(new URL('../assets/site-analytics.js', import.meta.url), 'utf8');
const contactScript = readFileSync(new URL('../assets/contact.js', import.meta.url), 'utf8');
const preferenceKey = 'tri-point-analytics';
const disableKey = 'ga-disable-G-EXAMPLE';
const quoteEvent = 'tri-point:quote-received';
const sources = ['linkedin', 'x', 'facebook'];
const campaigns = ['partner_lenovo', 'partner_fortinet', 'partner_wasabi', 'partner_ptzoptics', 'partner_arctic_wolf'];

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      const results = (listeners.get(event.type) || []).map(listener => listener(event));
      return Promise.all(results);
    },
    focus() {},
  };
}

function openPage({href = 'https://tripointgs.com/contact', trackPage = true, preference = null, contact = {}} = {}) {
  const tags = [];
  const cookieWrites = [];
  const window = eventTarget();
  const nodes = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, eventTarget());
    return nodes.get(id);
  };
  const panel = getNode('analytics-choices');
  panel.hidden = true;
  panel.querySelector = getNode;
  const document = Object.assign(eventTarget(), {
    currentScript: {dataset: {measurementId: 'G-EXAMPLE', trackPage: String(trackPage)}},
    referrer: 'https://social.example/profile/private?account=private#messages',
    head: {append: node => tags.push(node)},
    getElementById: getNode,
    querySelector: getNode,
    createElement: () => ({}),
  });
  Object.defineProperty(document, 'cookie', {set: value => cookieWrites.push(value)});
  const context = createContext({
    URL, URLSearchParams, window, document, Event, CustomEvent, AbortSignal,
    location: new URL(href),
    localStorage: {
      getItem: () => preference,
      setItem: (key, value) => {
        assert.equal(key, preferenceKey);
        preference = value;
      },
    },
  });
  runInContext(analyticsScript, context, {filename: 'site-analytics.js'});

  async function loadContact() {
    const form = getNode('contact-form');
    form.querySelectorAll = () => [];
    form.reportValidity = () => true;
    getNode('contact-submit').firstChild = {textContent: ''};
    const postReplies = [...(contact.postReplies || [])];
    Object.assign(context, {
      initQuotePicker: async () => ({getItems: () => [], clear() {}, refresh() {}}),
      readSelection: () => [],
      FormData: class {
        get(key) { return key === 'message' ? 'private project details' : null; }
        getAll() { return []; }
        has(key) { return key === 'consent'; }
      },
      fetch: async (path, options) => {
        assert.equal(path, '/api/contact');
        if (options.method !== 'POST') {
          return {ok: true, json: async () => ({enabled: true, preview: contact.preview === true, challenge: 'test'})};
        }
        const reply = postReplies.shift();
        assert.ok(reply, 'Unexpected quote POST');
        if (reply instanceof Error) throw reply;
        const [status, payload] = reply;
        return {status, ok: status >= 200 && status < 300, json: async () => payload};
      },
    });
    await runInContext(`(async () => {${contactScript.replace(/^import[^\n]+\n/, '')}\n})()`, context, {filename: 'contact.js'});
    return () => form.dispatchEvent({type: 'submit', preventDefault() {}});
  }

  return {
    tags, panel, window, cookieWrites, loadContact, getNode,
    click: control => getNode(`[data-analytics-${control}]`).dispatchEvent({type: 'click'}),
    commands: name => Array.from(window.dataLayer || [], args => JSON.parse(JSON.stringify(Array.from(args))))
      .filter(args => args[0] === name),
    quote: () => window.dispatchEvent(new Event(quoteEvent)),
    changePreference: value => window.dispatchEvent({type: 'storage', key: preferenceKey, newValue: value}),
  };
}

test('maps supported partner social campaigns before the page view and excludes unrelated URL data', () => {
  for (const source of sources) {
    for (const campaign of campaigns) {
      const href = `https://tripointgs.com/contact?utm_source=${source}&utm_medium=social&utm_campaign=${campaign}&email=buyer%40example.com&ref=private#request`;
      const page = openPage({href, preference: 'allow'});
      const [[, id, config]] = page.commands('config');
      assert.equal(id, 'G-EXAMPLE');
      assert.equal(config.campaign_source, source);
      assert.equal(config.campaign_medium, 'social');
      assert.equal(config.campaign_name, campaign);
      assert.equal(config.page_location, 'https://tripointgs.com/contact');
      assert.equal(config.page_referrer, 'https://social.example');
      const serialized = JSON.stringify(config);
      assert.doesNotMatch(serialized, /buyer|private|messages|#request|utm_/);
      assert.equal(page.tags.length, 1);
      assert.equal(page.tags[0].referrerPolicy, 'origin');
    }
  }
});

test('ignores incomplete and unsupported UTM combinations', () => {
  for (const query of [
    `utm_source=linkedin&utm_campaign=${campaigns[0]}`,
    `utm_source=linkedin&utm_medium=paid_social&utm_campaign=${campaigns[0]}`,
    `utm_source=private%40example.com&utm_medium=social&utm_campaign=${campaigns[0]}`,
    `utm_source=linkedin&utm_source=facebook&utm_medium=social&utm_campaign=${campaigns[0]}`,
    'utm_source=linkedin&utm_medium=social&utm_campaign=partner_unknown',
  ]) {
    const page = openPage({href: `https://tripointgs.com/contact?${query}`, preference: 'allow'});
    const [[, , config]] = page.commands('config');
    for (const name of ['campaign_source', 'campaign_medium', 'campaign_name']) {
      assert.equal(Object.hasOwn(config, name), false, `${name} for ${query}`);
    }
    assert.equal(config.page_location, 'https://tripointgs.com/contact');
  }
});

test('requires opt-in and respects withdrawal without reloading the tag or counting a quote twice', async () => {
  const page = openPage();
  assert.equal(page.panel.hidden, false);
  assert.equal(page.window[disableKey], true);
  await page.quote();
  assert.equal(page.tags.length, 0);
  assert.deepEqual(page.commands('event'), []);

  await page.click('allow');
  assert.equal(page.panel.hidden, true);
  assert.equal(page.window[disableKey], false);
  assert.deepEqual(page.commands('consent')[0], ['consent', 'default', {
    analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  }]);
  const [[, , config]] = page.commands('config');
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);

  await page.changePreference('decline');
  assert.equal(page.window[disableKey], true);
  assert.ok(page.cookieWrites.some(cookie => cookie.startsWith('_ga=; Max-Age=0;')));
  await page.quote();
  assert.deepEqual(page.commands('event'), []);

  await page.click('allow');
  await page.quote();
  await page.quote();
  assert.equal(page.tags.length, 1);
  assert.equal(page.commands('config').length, 1);
  assert.deepEqual(page.commands('event'), [['event', 'generate_lead', {form_id: 'contact-form'}]]);
});

test('does not track declined, settings-only or non-production visits or quotes on other pages', async () => {
  for (const settings of [
    {preference: 'decline'},
    {href: 'https://tripointgs.com/privacy', trackPage: false, preference: 'allow'},
    {href: 'https://preview.tripointgs.com/contact', preference: 'allow'},
  ]) {
    const page = openPage(settings);
    assert.equal(page.panel.hidden, true);
    await page.quote();
    assert.equal(page.tags.length, 0);
    assert.deepEqual(page.commands('event'), []);
  }
  const home = openPage({href: 'https://tripointgs.com/', preference: 'allow'});
  await home.quote();
  assert.equal(home.tags.length, 1);
  assert.deepEqual(home.commands('event'), []);
});

test('tracks only a confirmed production quote and counts a confirmed retry once', async () => {
  const receipt = {ok: true, id: 'private-reference', isTest: false, message: 'Your request was saved.'};
  const page = openPage({preference: 'allow', contact: {postReplies: [new Error('Lost response'), [200, receipt]]}});
  const quoteEvents = [];
  page.window.addEventListener(quoteEvent, event => quoteEvents.push(event));
  const submit = await page.loadContact();
  await submit();
  assert.deepEqual(page.commands('event'), []);
  await submit();
  await submit();
  assert.equal(page.getNode('contact-reference').textContent, receipt.id);
  assert.equal(quoteEvents.length, 1);
  assert.equal(quoteEvents[0].detail ?? null, null);
  assert.deepEqual(page.commands('event'), [['event', 'generate_lead', {form_id: 'contact-form'}]]);

  const declined = openPage({preference: 'decline', contact: {postReplies: [[201, receipt]]}});
  await (await declined.loadContact())();
  assert.equal(declined.getNode('contact-reference').textContent, receipt.id);
  assert.deepEqual(declined.commands('event'), []);

  for (const contact of [
    {postReplies: [[400, {ok: false, error: 'Invalid request'}]]},
    {postReplies: [[201, {...receipt, id: undefined}]]},
    {postReplies: [[201, {...receipt, isTest: true}]]},
    {postReplies: [[201, {...receipt, isTest: undefined}]]},
    {preview: true, postReplies: [[201, receipt]]},
  ]) {
    const otherPage = openPage({preference: 'allow', contact});
    await (await otherPage.loadContact())();
    assert.deepEqual(otherPage.commands('event'), [], JSON.stringify(contact));
  }
});
