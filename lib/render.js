// Renders audit results as email-safe HTML (inline styles) and plain text.
import { escapeHtml as e } from './html.js';
import { config } from './config.js';

const COLORS = { high: '#991b1b', medium: '#92400e', low: '#475569' };
const BG = { high: '#fdecec', medium: '#fdf6ec', low: '#f1f5f9' };
const scoreColor = s => (s >= 80 ? '#166534' : s >= 60 ? '#92400e' : '#991b1b');

function shell(inner, preheader = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f6f8fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a2433;line-height:1.55">
<span style="display:none;max-height:0;overflow:hidden">${e(preheader)}</span>
<div style="max-width:680px;margin:0 auto;padding:24px 16px">${inner}
<p style="font-size:12px;color:#64748b;margin-top:28px">${e(config.brand)} &middot; Automated review of publicly available pages, for information only. Accessibility checks cover basics only and are not legal advice. No specific ranking or patient results are guaranteed.</p>
</div></body></html>`;
}

function scoreBlock(report, previousScore) {
  const delta = Number.isFinite(previousScore) ? report.score - previousScore : null;
  const deltaHtml = delta === null ? '' : `<div style="font-size:14px;margin-top:4px;color:${delta >= 0 ? '#166534' : '#991b1b'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} since last check (was ${previousScore})</div>`;
  return `<table role="presentation" width="100%" style="background:#fff;border:1px solid #d9e0e7;border-radius:12px;border-collapse:separate"><tr>
<td style="padding:20px;width:120px;text-align:center;vertical-align:middle">
<div style="font-size:48px;font-weight:800;color:${scoreColor(report.score)};line-height:1">${report.score}</div>
<div style="font-size:14px;font-weight:700;color:#4a5568">Grade ${e(report.grade)}</div>${deltaHtml}</td>
<td style="padding:20px 20px 20px 0;vertical-align:middle">${report.categories.filter(c => c.score !== null).map(c => `
<div style="font-size:14px;margin:3px 0"><span style="display:inline-block;width:170px">${e(c.label)}</span><span style="display:inline-block;width:120px;height:8px;background:#e5e7eb;border-radius:4px;vertical-align:middle"><span style="display:block;width:${c.score}%;height:8px;background:${scoreColor(c.score)};border-radius:4px"></span></span> <strong style="color:${scoreColor(c.score)}">${c.score}</strong></div>`).join('')}
</td></tr></table>`;
}

function issueHtml(f, { showFix = true } = {}) {
  return `<div style="border-left:4px solid ${COLORS[f.severity]};background:${BG[f.severity]};padding:12px 14px;border-radius:6px;margin:10px 0">
<span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;background:${COLORS[f.severity]};color:#fff;padding:1px 8px;border-radius:999px;margin-right:6px">${e(f.severity)}</span>
<strong>${e(f.title)}</strong>
<div style="margin-top:4px">${e(f.impact)}</div>
${showFix && f.fix ? `<div style="margin-top:4px"><em>Fix:</em> ${e(f.fix)}</div>` : ''}</div>`;
}

const btn = (href, label) => `<a href="${e(href)}" style="display:inline-block;background:#0b6e6e;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;margin:6px 6px 6px 0">${e(label)}</a>`;

/** Body of the full report (no <html> shell), used both on the web page and inside emails. */
export function renderReportBody(report, { previousScore, heading } = {}) {
  const byCat = new Map(report.categories.map(c => [c.key, c.label]));
  const groups = ['high', 'medium', 'low'].map(sev => ({ sev, items: report.findings.filter(f => f.severity === sev) })).filter(g => g.items.length);
  const sevLabel = { high: 'Fix first (high impact)', medium: 'Fix next (medium impact)', low: 'Nice to fix (low impact)' };
  const psi = report.pagespeed ? `<p style="font-size:14px;color:#4a5568">Google mobile performance: <strong>${report.pagespeed.score}/100</strong>${report.pagespeed.lcp ? ` · Largest content paint ${e(report.pagespeed.lcp)}` : ''}${report.pagespeed.cls ? ` · Layout shift ${e(report.pagespeed.cls)}` : ''}</p>` : '';
  return `<h1 style="font-size:24px;margin:0 0 4px">${e(heading || 'Website Health Report')}</h1>
<p style="margin:0 0 16px;color:#4a5568"><strong>${e(report.host)}</strong> &middot; checked ${e(new Date(report.checkedAt).toUTCString().replace(/:\d\d GMT/, ' UTC'))}</p>
${scoreBlock(report, previousScore)}
${psi}
<h2 style="font-size:19px;margin:24px 0 4px">Prioritized fix list (${report.findings.length} ${report.findings.length === 1 ? 'issue' : 'issues'})</h2>
<p style="margin:0;color:#4a5568;font-size:14px">Hand this list to your web designer or IT provider. Work from the top down.</p>
${groups.map(g => `<h3 style="font-size:16px;margin:18px 0 0;color:${COLORS[g.sev]}">${sevLabel[g.sev]}</h3>${g.items.map(f => issueHtml({ ...f, title: `${byCat.get(f.category)}: ${f.title}` })).join('')}`).join('')}
${report.findings.length ? '' : '<p>No issues found. Excellent work!</p>'}
<h2 style="font-size:19px;margin:24px 0 8px">What's already working (${report.passed.length})</h2>
<ul style="padding-left:20px;margin:0;font-size:14px;color:#334155">${report.passed.map(p => `<li>${e(byCat.get(p.category))}: ${e(p.title)}</li>`).join('')}</ul>`;
}

export function renderReportEmail(report, { reportUrl, previousScore, intro, monitorUrl, isMonitoring, foundingBonus } = {}) {
  const ctas = [reportUrl && btn(reportUrl, 'View / print this report'), monitorUrl && btn(monitorUrl, 'Add monthly monitoring')].filter(Boolean).join('');
  const portal = isMonitoring && config.portalUrl ? `<p style="font-size:13px;color:#4a5568">Manage or cancel your monitoring any time: <a href="${e(config.portalUrl)}">billing portal</a>.</p>` : '';
  const bonus = foundingBonus ? `<p style="background:#e6f4f4;border-radius:8px;padding:12px 14px"><strong>Founding-clinic bonus:</strong> you're one of our first ${config.foundingSpots} practices, so we'll automatically re-check your site in about ${config.foundingRecheckDays} days and email you an updated report showing your score change. Free, no card, nothing renews.</p>` : '';
  const inner = `${intro ? `<p>${e(intro)}</p>` : ''}${bonus}${ctas ? `<p>${ctas}</p>` : ''}
<div style="background:#fff;border:1px solid #d9e0e7;border-radius:12px;padding:20px;margin-top:12px">${renderReportBody(report, { previousScore, heading: isMonitoring ? 'Monthly Website Health Report' : undefined })}</div>${portal}
<p style="font-size:14px">Want us to fix these for you? Just reply to this email for a fixed-price Fix-It quote.</p>`;
  return shell(inner, `Score ${report.score}/100 (Grade ${report.grade}) for ${report.host}`);
}

export function renderSnapshotEmail(snapshot, { name, buyUrl }) {
  const inner = `<p>Hi ${e(name || 'there')},</p><p>Here's your free website snapshot for <strong>${e(snapshot.host)}</strong>.</p>
${scoreBlock(snapshot)}
<h2 style="font-size:18px;margin:22px 0 4px">Your top ${snapshot.topIssues.length} issues</h2>
${snapshot.topIssues.map(f => issueHtml(f, { showFix: false })).join('')}
<p>We found <strong>${snapshot.totalIssues} issues</strong> in total. The full report lists every one, in priority order, with a step-by-step fix your web person can follow, and it's delivered to your inbox in minutes.</p>
${buyUrl ? `<p>${btn(buyUrl, `Get the full report — $${(config.plans.report.cents / 100).toFixed(0)}`)}</p>` : ''}`;
  return shell(inner, `Your website scored ${snapshot.score}/100`);
}

export function reportText(report, { reportUrl } = {}) {
  return [`Website Health Report: ${report.host}`, `Score ${report.score}/100 (Grade ${report.grade})`, '',
    ...report.categories.filter(c => c.score !== null).map(c => `${c.label}: ${c.score}`), '',
    ...report.findings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Why: ${f.impact}\n   Fix: ${f.fix}`),
    '', reportUrl ? `View online: ${reportUrl}` : ''].join('\n');
}
