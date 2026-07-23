const test = require('node:test');
const assert = require('node:assert/strict');

const { collectContext } = require('../src/collectors');

test('collectContext aggregates all collector stubs without throwing', async () => {
  const result = await collectContext('a pet-sitting marketplace');
  assert.equal(result.signals.length, 4);
  const sources = result.signals.map((s) => s.source).sort();
  assert.deepEqual(sources, ['google-trends', 'product-data', 'tiktok', 'youtube']);
  for (const signal of result.signals) {
    assert.equal(signal.available, false);
  }
});
