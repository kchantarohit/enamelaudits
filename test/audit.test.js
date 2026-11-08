import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.AUDIT_ALLOW_PRIVATE = '1';
const { runAudit, toSnapshot, gradeFor } = await import('../lib/audit.js');
const { startFixtureServer } = await import('./serve-fixtures.js');

let srv;
before(async () => { srv = await startFixtureServer(); });
after(() => srv.server.close());

test('bad site scores low and surfaces the expected issues', async () => {
  const r = await runAudit(`${srv.base}/bad/`, { now: new Date('2026-11-08') });
  const titles = r.findings.map(f => f.title).join('\n');
  assert.ok(r.score < 60, `score ${r.score}`);
  assert.match(titles, /tap-to-call/);
  assert.match(titles, /booking/);
  assert.match(titles, /not set up for phones/);
  assert.match(titles, /2 main headings/);
  assert.match(titles, /copyright says 2019/);
  assert.match(titles, /broken/);
  assert.match(titles, /1 of 2 images have no alt text/);
  assert.equal(r.findings[0].severity, 'high');
});

test('good site scores well and passes key checks', async () => {
  const r = await runAudit(`${srv.base}/good/`, { now: new Date('2026-11-08') });
  const passed = r.passed.map(p => p.title).join('\n');
  assert.match(passed, /Tap-to-call/);
  assert.match(passed, /Online booking/);
  assert.match(passed, /Local business schema/);
  assert.match(passed, /Street address visible/);
  assert.match(passed, /Mobile viewport/);
  assert.ok(r.score >= 70, `score ${r.score}: ${r.findings.map(f => f.title).join(' | ')}`);
});

test('snapshot hides fixes and caps at 3 issues', async () => {
  const r = await runAudit(`${srv.base}/bad/`);
  const s = toSnapshot(r);
  assert.equal(s.topIssues.length, 3);
  assert.ok(s.topIssues.every(i => !('fix' in i)));
  assert.equal(s.totalIssues, r.findings.length);
});

test('grades', () => {
  assert.equal(gradeFor(95), 'A'); assert.equal(gradeFor(68), 'D'); assert.equal(gradeFor(10), 'F');
});

test('audit respects its time budget even when the site hangs', async () => {
  const t0 = Date.now();
  const r = await runAudit(`${srv.base}/slow/`, { budgetMs: 4000 });
  const took = Date.now() - t0;
  assert.ok(took < 5500, `took ${took}ms`);
  assert.ok(Number.isFinite(r.score));
});
