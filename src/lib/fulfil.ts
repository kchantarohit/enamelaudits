import "server-only";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { runAudit } from "./audit/engine";
import { createAudit, getAudit, isUuid, markPaid, upsertSubscription, subscriptionRan } from "./db";
import { notifyOwner, sendReportReady } from "./email";
import { SITE } from "./site";
import { businessFromSession, websiteFromSession } from "./stripe";

export function hashIp(ip: string) {
  return createHash("sha256").update(`${process.env.APP_SECRET || ""}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export const reportUrl = (id: string) => `${SITE.url}/report/${id}`;

function sessionEmail(s: Stripe.Checkout.Session) {
  return s.customer_details?.email || s.customer_email || null;
}

/**
 * Handle a completed Stripe Checkout Session (from a Payment Link or a dynamic session).
 * Idempotent: safe to call more than once for the same session.
 */
export async function fulfilCheckout(s: Stripe.Checkout.Session) {
  const email = sessionEmail(s);
  const auditId = isUuid(s.client_reference_id) ? s.client_reference_id : isUuid(s.metadata?.audit_id) ? s.metadata!.audit_id : null;
  const amount = s.amount_total ?? null;

  if (s.mode === "subscription") {
    const source = auditId ? await getAudit(auditId) : null;
    const website = source?.final_url || source?.url || websiteFromSession(s);
    if (!website) {
      await notifyOwner("Subscription without website", `Session ${s.id} (${email}) has no audit or website. Follow up manually.`);
      return null;
    }
    // First monitoring report runs right away and unlocks the full report.
    const result = await runAudit(website);
    const newId = await createAudit({
      url: website,
      result,
      email,
      business_name: source?.business_name || businessFromSession(s),
      source: "monitoring",
      parent_id: source?.id || null,
      paid: true,
      stripe_session_id: s.id,
      amount_cents: amount,
      customer_email: email,
    });
    const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
    const rowId = await upsertSubscription({
      email: email || "",
      website,
      stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer?.id || null,
      stripe_subscription_id: subId || s.id,
      plan: s.metadata?.enamel_product || "monitoring",
      status: "active",
    });
    await subscriptionRan(rowId, newId, result.score);
    if (email) await sendReportReady(email, result.meta.domain, reportUrl(newId), result.score, result.grade).catch(() => false);
    await notifyOwner("New monitoring subscription", `${email} subscribed for ${website}. Report: ${reportUrl(newId)}`);
    return newId;
  }

  // One-time report
  if (auditId) {
    const row = await markPaid(auditId, s.id, amount, email);
    if (row) {
      if (email) await sendReportReady(email, row.domain, reportUrl(row.id), row.score, row.grade).catch(() => false);
      await notifyOwner(`Sale: $${((amount || 0) / 100).toFixed(2)} report`, `${email} unlocked ${row.domain}. ${reportUrl(row.id)}`);
      return row.id;
    }
  }
  // Legacy payment link: the buyer typed their website into a custom field.
  const website = websiteFromSession(s);
  if (!website) {
    await notifyOwner("Paid session without website", `Session ${s.id} (${email}) paid but gave no website. Follow up manually.`);
    return null;
  }
  const result = await runAudit(website);
  const id = await createAudit({
    url: website,
    result,
    email,
    business_name: businessFromSession(s),
    source: "payment_link",
    paid: true,
    stripe_session_id: s.id,
    amount_cents: amount,
    customer_email: email,
  });
  if (email) await sendReportReady(email, result.meta.domain, reportUrl(id), result.score, result.grade).catch(() => false);
  await notifyOwner(`Sale: $${((amount || 0) / 100).toFixed(2)} report`, `${email} bought a report for ${website}. ${reportUrl(id)}`);
  return id;
}
