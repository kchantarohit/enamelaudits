import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { forgetEvent, recordEvent, setSubscriptionStatus } from "@/lib/db";
import { fulfilCheckout } from "@/lib/fulfil";
import { notifyOwner } from "@/lib/email";
import { verifyWebhook } from "@/lib/stripe";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhook(raw, req.headers.get("stripe-signature"));
  } catch (e) {
    console.error("webhook signature failed", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const fresh = await recordEvent(event.id, event.type);
  if (!fresh) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") break;
        if (s.mode === "payment" && s.client_reference_id) {
          // Fast path: unlocking an existing report is quick, do it inline.
          await fulfilCheckout(s);
        } else {
          // Needs a fresh audit (legacy link or subscription); finish after responding.
          after(async () => {
            try {
              await fulfilCheckout(s);
            } catch (e) {
              console.error("deferred fulfilment failed", e);
              await forgetEvent(event.id).catch(() => {});
              await notifyOwner("Fulfilment failed", `Session ${s.id}: ${e instanceof Error ? e.message : e}`);
            }
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await setSubscriptionStatus(sub.id, "canceled");
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await setSubscriptionStatus(sub.id, sub.status);
        break;
      }
    }
  } catch (e) {
    console.error("webhook handling failed", e);
    await forgetEvent(event.id).catch(() => {});
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
