import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_PASSWORD_MIN_LENGTH,adminPasswordConfigured} from '../api/admin.js';

test('administrator password configuration requires 12 or more characters', () => {
 assert.equal(ADMIN_PASSWORD_MIN_LENGTH,12);
 assert.equal(adminPasswordConfigured(undefined),false);
 assert.equal(adminPasswordConfigured(null),false);
 assert.equal(adminPasswordConfigured(''),false);
 assert.equal(adminPasswordConfigured('a'.repeat(11)),false);
 assert.equal(adminPasswordConfigured('a'.repeat(12)),true);
 assert.equal(adminPasswordConfigured('a'.repeat(13)),true);
 assert.equal(adminPasswordConfigured('a'.repeat(24)),true);
});
test('administrator password policy does not coerce nonstrings into passwords', () => {
 assert.equal(adminPasswordConfigured(123456789012),false);
 assert.equal(adminPasswordConfigured(['a'.repeat(12)]),false);
});
