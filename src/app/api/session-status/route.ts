import { NextResponse, type NextRequest } from "next/server";
import { findAuditBySession, getAudit, isUuid } from "@/lib/db";
import { fulfilCheckout } from "@/lib/fulfil";
import { stripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id") || "";
  const auditHint = req.nextUrl.searchParams.get("audit");
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) return NextResponse.json({ status: "invalid" }, { status: 400 });

  const found = await findAuditBySession(sessionId);
  if (found) return NextResponse.json({ status: "ready", auditId: found });

  // With a secret key we can confirm payment directly instead of waiting for the webhook.
  const stripe = stripeClient();
  if (stripe) {
    try {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      // Only the idempotent "unlock an existing report" path runs here; anything that
      // creates a new audit is left to the webhook so it can't run twice.
      if ((s.payment_status === "paid" || s.payment_status === "no_payment_required") && s.mode === "payment" && isUuid(s.client_reference_id)) {
        const id = await fulfilCheckout(s);
        if (id) return NextResponse.json({ status: "ready", auditId: id });
      }
    } catch (e) {
      console.error("session lookup failed", e);
    }
  }
  if (isUuid(auditHint)) {
    const a = await getAudit(auditHint);
    if (a?.paid) return NextResponse.json({ status: "ready", auditId: a.id });
  }
  return NextResponse.json({ status: "pending" });
}
