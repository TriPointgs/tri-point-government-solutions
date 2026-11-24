import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanSelection, initQuotePicker} from '../assets/quote-selection.js';
import {CONTACT_CONSENT, validateContact} from '../lib/contact-model.mjs';
import {quotePicker} from '../lib/quote-picker.mjs';

const item = quantity => ({description: 'Example part', quantity});
const inquiry = quantity => ({
  organization: 'Example buyer', name: 'Example person', email: 'buyer@example.invalid',
  items: [item(quantity)], consent: true, consentVersion: CONTACT_CONSENT
});

test('draft restoration and quote intake accept 9999 and handle 10000 according to their own rules', () => {
  assert.deepEqual(cleanSelection([item(9999), item(10000)]), [item(9999)]);
  assert.deepEqual(validateContact(inquiry(9999)).items, [item(9999)]);
  assert.throws(() => validateContact(inquiry(10000)), error => error.status === 400);
});

test('picker accepts a combined quantity of 9999 and preserves the line on overflow', async t => {
  // Supply only the empty catalog and the DOM operations used by the quote picker.
  const element = () => ({
    value: '', listeners: {}, children: [],
    setAttribute() {},
    addEventListener(event, fn) { this.listeners[event] = fn; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    querySelectorAll() { return []; }
  });
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {getElementById, createElement: element}});
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  t.mock.method(globalThis, 'fetch', async () => ({ok: true, json: async () => []}));

  const picker = await initQuotePicker({initial: []});
  assert.match(quotePicker(), /id="quote-custom-quantity"[^>]+max="9999"/);
  assert.equal(picker.add('Example part', 10000), false);
  assert.equal(picker.add('Example part', 9998), true);
  assert.equal(picker.add('example PART', 1), true);
  assert.equal(picker.add('Example part', 1), false);
  assert.deepEqual(picker.getItems(), [item(9999)]);

  const input = getElementById('quote-selected').children[0].children[1].children[0];
  assert.equal(input.max, '9999');
  input.value = '10000';
  input.listeners.change();
  assert.equal(input.value, '9999');
  assert.deepEqual(picker.getItems(), [item(9999)]);
});
