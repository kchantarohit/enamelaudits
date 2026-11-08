// Transactional email. Two free options, picked automatically from env vars:
//   1. Gmail SMTP (default, $0, no domain needed): GMAIL_USER + GMAIL_APP_PASSWORD. ~500 emails/day.
//   2. Resend REST API (optional): RESEND_API_KEY + EMAIL_FROM on a verified domain.
import { config } from './config.js';

let transport; // lazily created nodemailer transport (reused across warm invocations)
let testTransport = null;

export function emailProvider() {
  if (testTransport) return 'test';
  if (config.gmailUser && config.gmailAppPassword) return 'gmail';
  if (config.resendKey) return 'resend';
  return null;
}

export function emailEnabled() { return emailProvider() !== null; }

/** Test hook: replace the SMTP transport with a fake ({ sendMail }). */
export function _setTransportForTest(t) { testTransport = t; }

async function smtpTransport() {
  if (testTransport) return testTransport;
  if (!transport) {
    const { default: nodemailer } = await import('nodemailer');
    transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
    });
  }
  return transport;
}

export async function sendEmail({ to, subject, html, text, bcc }) {
  const provider = emailProvider();
  if (!provider) { console.warn('[email] no email provider configured, skipping email to', to); return { skipped: true }; }
  if (!to) return { skipped: true };

  if (provider === 'gmail' || provider === 'test') {
    const from = config.emailFrom || `"${config.brand}" <${config.gmailUser}>`;
    const info = await (await smtpTransport()).sendMail({
      from, to, subject, html, text,
      ...(bcc ? { bcc } : {}),
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });
    return { id: info.messageId };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: config.emailFrom || 'Enamel Audits <onboarding@resend.dev>', to: [to], subject, html, text,
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
  const to = config.ownerEmail || config.gmailUser;
  if (!to) return;
  try { await sendEmail({ to, subject: `[${config.brand}] ${subject}`, text, html: `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${text.replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'))}</pre>` }); }
  catch (e) { console.error('[email] owner notify failed', e.message); }
}
