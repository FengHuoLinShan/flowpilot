import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { newIdempotencyKey } from '../src/lib/ids.ts';

test('uses native randomUUID when available', () => {
  const source = {
    randomUUID() { assert.equal(this, source); return 'bfbf6066-35c2-4ebe-9b51-33472fb0fca3'; },
    getRandomValues() { assert.fail('Native UUID should not call the fallback'); },
  };
  assert.equal(newIdempotencyKey(source), 'bfbf6066-35c2-4ebe-9b51-33472fb0fca3');
});

test('HTTP-context fallback sets RFC 4122 version and variant bits', () => {
  for (const [fill, expected] of [
    [0x00, '00000000-0000-4000-8000-000000000000'],
    [0xff, 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
  ]) {
    let calls = 0;
    const source = {
      getRandomValues(bytes) {
        assert.equal(this, source);
        assert.ok(bytes instanceof Uint8Array);
        assert.equal(bytes.length, 16);
        calls += 1;
        bytes.fill(fill);
        return bytes;
      },
    };
    assert.equal(newIdempotencyKey(source), expected);
    assert.equal(calls, 1);
  }
});

test('fallback uses real getRandomValues without requiring randomUUID', () => {
  const source = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const ids = Array.from({ length: 128 }, () => newIdempotencyKey(source));
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('fails explicitly if the environment has no secure random source', () => {
  assert.throws(() => newIdempotencyKey({}), /Secure randomness is unavailable/);
});
