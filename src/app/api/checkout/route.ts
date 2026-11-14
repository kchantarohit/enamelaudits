import { NextResponse, type NextRequest } from "next/server";
import { getAudit, isUuid } from "@/lib/db";
import { checkoutUrl, type Plan } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const PLANS: Plan[] = ["report", "monthly", "annual"];

export async function GET(req: NextRequest) {
  const auditId = req.nextUrl.searchParams.get("audit");
  const plan = (req.nextUrl.searchParams.get("plan") || "report") as Plan;
  if (!isUuid(auditId) || !PLANS.includes(plan)) return NextResponse.redirect(new URL("/", req.url), 303);
  try {
    const audit = await getAudit(auditId);
    if (!audit) return NextResponse.redirect(new URL("/", req.url), 303);
    if (plan === "report" && audit.paid) return NextResponse.redirect(new URL(`/report/${auditId}`, req.url), 303);
    const url = await checkoutUrl(plan, auditId, audit.email);
    return NextResponse.redirect(url, 303);
  } catch (e) {
    console.error("checkout failed", e);
    return NextResponse.redirect(new URL(`/report/${auditId}?checkout_error=1`, req.url), 303);
  }
}
