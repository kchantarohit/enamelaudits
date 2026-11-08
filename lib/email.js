// Transactional email via Resend's REST API (https://resend.com). No SDK needed.
import { config } from './config.js';

export function emailEnabled() { return Boolean(config.resendKey); }

export async function sendEmail({ to, subject, html, text, bcc }) {
  if (!config.resendKey) { console.warn('[email] RESEND_API_KEY not set, skipping email to', to); return { skipped: true }; }
  if (!to) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: config.emailFrom, to: [to], subject, html, text,
      ...(bcc ? { bcc: [bcc] } : {}),
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Best-effort owner notification; never throws. */
export async function notifyOwner(subject, text) {
  if (!config.ownerEmail) return;
  try { await sendEmail({ to: config.ownerEmail, subject: `[${config.brand}] ${subject}`, text, html: `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${text.replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'))}</pre>` }); }
  catch (e) { console.error('[email] owner notify failed', e.message); }
}
