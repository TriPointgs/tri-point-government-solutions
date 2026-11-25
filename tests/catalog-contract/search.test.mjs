import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { catalogQuery, searchPrivateCatalog } from '../../lib/catalog-remote.mjs';

const driver = fileURLToPath(new URL('./query_gateway.py', import.meta.url));
const env = {
  TP_CATALOG_API_URL: 'https://catalog.example.invalid',
  TP_CATALOG_API_TOKEN: 'synthetic-catalog-contract-token-12345678',
};

function queryGateway(url, options) {
  assert.equal(options.method, 'GET');
  const result = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [driver], {
    input: JSON.stringify({ path: url.pathname + url.search, headers: options.headers }),
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const { status, body } = JSON.parse(result.stdout);
  return new Response(JSON.stringify(body), { status });
}

function search(params) {
  return searchPrivateCatalog(catalogQuery(new URLSearchParams(params)), { env, fetcher: queryGateway });
}

test('exact catalog search matches each identifier and excludes prefix matches', async () => {
  for (const q of ['PART-1', 'SKU-1', 'DIST-1']) {
    const result = await search({ q, exact: '1' });
    assert.deepEqual(result.items.map(item => item.mfgPart), ['PART-1']);
    assert.equal(result.exact, true);
    assert.equal(result.stockVerified, false);
    assert.equal(result.priceVerified, false);
  }
});

test('category filtering precedes pagination in the SQLite gateway', async () => {
  const first = await search({ maker: 'Example', category: 'laptops' });
  const next = await search({ maker: 'Example', category: 'laptops', page: '1' });
  assert.equal(first.category, 'laptops');
  assert.equal(first.filterVersion, 2);
  assert.deepEqual(first.items.map(i => i.mfgPart), Array.from({ length: 50 }, (_, i) => 'PART-' + (52 + i)));
  assert.equal(first.hasMore, true);
  assert.deepEqual(next.items.map(i => i.mfgPart), ['PART-102']);
  assert.equal(next.hasMore, false);
});

test('keyword mode matches descriptions while exact mode uses identifiers only', async () => {
  const keyword = await search({ q: 'sleeve' });
  assert.equal(keyword.exact, false);
  assert.equal(keyword.items.length, 50);
  assert.equal(keyword.hasMore, true);
  assert.ok(keyword.items.every(item => item.description === 'Laptop sleeve'));
  const exact = await search({ q: 'sleeve', exact: '1' });
  assert.deepEqual(exact.items, []);
});
