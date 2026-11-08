import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SITE_URL = 'https://<your-url>';
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'enamelaudits.vercel.app';
const { config } = await import('../lib/config.js');

test('a placeholder SITE_URL is ignored and the Vercel production URL is used', () => {
  assert.equal(config.siteUrl, 'https://enamelaudits.vercel.app');
});
