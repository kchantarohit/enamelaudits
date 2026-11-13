import { NextResponse } from "next/server";
import { runAudit } from "@/lib/audit/engine";
import { AuditError } from "@/lib/audit/safe-fetch";
import { createAudit, getAudit, isUuid, useRescan } from "@/lib/db";
import { SITE } from "@/lib/site";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  const audit = await getAudit(id);
  if (!audit || !audit.paid) return NextResponse.json({ error: "Re-scans are included with the full report." }, { status: 403 });
  const ageDays = (Date.now() - new Date(audit.paid_at || audit.created_at).getTime()) / 86_400_000;
  if (ageDays > 30) return NextResponse.json({ error: "Free re-scans are available for 30 days after purchase." }, { status: 403 });
  if (!(await useRescan(id, SITE.rescanLimit))) {
    return NextResponse.json({ error: `You've used both free re-scans. Monitoring includes a fresh report every month.` }, { status: 403 });
  }
  try {
    const result = await runAudit(audit.final_url || audit.url);
    const newId = await createAudit({
      url: audit.url,
      result,
      email: audit.email,
      business_name: audit.business_name,
      source: "rescan",
      parent_id: audit.id,
      paid: true,
      customer_email: audit.customer_email,
    });
    return NextResponse.json({ id: newId });
  } catch (e) {
    const msg = e instanceof AuditError ? e.message : "The re-scan failed. Please try again.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
