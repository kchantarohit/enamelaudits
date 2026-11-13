import "server-only";
import Stripe from "stripe";
import { SITE } from "./site";

export type Plan = "report" | "monthly" | "annual";

let client: Stripe | null = null;
/** Full Stripe API client. Only available when STRIPE_SECRET_KEY is configured. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

export function verifyWebhook(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

const PAYMENT_LINKS: Record<Plan, string | undefined> = {
  report: process.env.STRIPE_LINK_REPORT,
  monthly: process.env.STRIPE_LINK_MONTHLY,
  annual: process.env.STRIPE_LINK_ANNUAL,
};

const PRICE_IDS: Record<Plan, string | undefined> = {
  report: process.env.STRIPE_PRICE_REPORT,
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

/**
 * Build a Stripe Checkout URL for an audit.
 * With STRIPE_SECRET_KEY: a dynamic Checkout Session (success URL goes straight to the report).
 * Without it: the matching Stripe Payment Link (also Stripe Checkout), tagged with the audit id
 * via client_reference_id so the webhook can unlock the right report.
 */
export async function checkoutUrl(plan: Plan, auditId: string, email?: string | null): Promise<string> {
  const stripe = stripeClient();
  const price = PRICE_IDS[plan];
  if (stripe && price) {
    const session = await stripe.checkout.sessions.create({
      mode: plan === "report" ? "payment" : "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: auditId,
      customer_email: email || undefined,
      allow_promotion_codes: true,
      metadata: { audit_id: auditId, enamel_product: plan },
      ...(plan === "report"
        ? { payment_intent_data: { metadata: { audit_id: auditId } }, customer_creation: "if_required" as const }
        : { subscription_data: { metadata: { audit_id: auditId, enamel_product: plan } } }),
      success_url: `${SITE.url}/thanks?session_id={CHECKOUT_SESSION_ID}&audit=${auditId}`,
      cancel_url: `${SITE.url}/report/${auditId}?canceled=1`,
    });
    if (session.url) return session.url;
  }
  const link = PAYMENT_LINKS[plan];
  if (!link) throw new Error(`No Stripe payment link configured for plan "${plan}"`);
  const u = new URL(link);
  u.searchParams.set("client_reference_id", auditId);
  if (email) u.searchParams.set("prefilled_email", email);
  return u.toString();
}

/** Pull the practice website out of a session's custom fields (legacy payment links ask for it). */
export function websiteFromSession(s: Stripe.Checkout.Session): string | null {
  const f = s.custom_fields?.find((c) => c.key === "website");
  return f?.text?.value?.trim() || null;
}

export function businessFromSession(s: Stripe.Checkout.Session): string | null {
  const f = s.custom_fields?.find((c) => c.key === "businessname");
  return f?.text?.value?.trim() || null;
}
