import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTokenTtl } from './auth.utils.js';

test('parseTokenTtl handles supported units', () => {
  assert.equal(parseTokenTtl('15m'), 15 * 60 * 1000);
  assert.equal(parseTokenTtl('7d'), 7 * 24 * 60 * 60 * 1000);
  assert.equal(parseTokenTtl('500ms'), 500);
});

test('parseTokenTtl rejects unsupported values', () => {
  assert.throws(() => parseTokenTtl('2w'), /Unsupported token TTL format/);
});
