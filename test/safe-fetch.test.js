import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, normalizeUrl } from '../lib/safe-fetch.js';

test('private IPs are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});

test('normalizeUrl', () => {
  assert.equal(normalizeUrl('example-dental.com').href, 'https://example-dental.com/');
  assert.throws(() => normalizeUrl('localhost'));
  assert.throws(() => normalizeUrl('ftp://x.com'));
  assert.throws(() => normalizeUrl('https://x.com:8080/'));
  assert.throws(() => normalizeUrl('https://user:pw@x.com/'));
  assert.throws(() => normalizeUrl(''));
});
