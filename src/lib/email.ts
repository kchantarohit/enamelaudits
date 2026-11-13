import "server-only";
import { SITE } from "./site";

/**
 * Optional transactional email over SMTP (works with Gmail app passwords,
 * Google Workspace, Resend SMTP, Postmark, SES...). If SMTP isn't configured,
 * sending is skipped and the in-browser flow still delivers every report.
 */
export function emailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  if (!emailConfigured() || !to) return false;
  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `${SITE.name} <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
    replyTo: SITE.contactEmail,
  });
  return true;
}

export async function sendReportReady(to: string, domain: string, reportUrl: string, score: number, grade: string) {
  const text = [
    `Your full website health report for ${domain} is ready.`,
    ``,
    `Score: ${score}/100 (grade ${grade})`,
    `Open your report: ${reportUrl}`,
    ``,
    `Every issue includes a plain-English explanation and the exact fix, so you can forward the link to whoever manages your website.`,
    `Your report includes ${SITE.rescanLimit} free re-scans to confirm fixes.`,
    ``,
    `Questions? Just reply to this email.`,
    `${SITE.name}`,
  ].join("\n");
  return sendEmail(to, `Your website health report for ${domain} (${score}/100)`, text);
}

export async function notifyOwner(subject: string, text: string) {
  const owner = process.env.OWNER_EMAIL || SITE.contactEmail;
  return sendEmail(owner, `[${SITE.name}] ${subject}`, text).catch(() => false);
}
