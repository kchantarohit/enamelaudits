import { NextResponse } from "next/server";
import { runAudit } from "@/lib/audit/engine";
import { createAudit, dueSubscriptions, subscriptionRan } from "@/lib/db";
import { notifyOwner, sendEmail } from "@/lib/email";
import { reportUrl } from "@/lib/fulfil";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily job (Vercel Cron): re-audit monitoring subscribers whose month is up. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const due = await dueSubscriptions(8);
  const done: string[] = [];
  for (const sub of due) {
    try {
      const result = await runAudit(sub.website);
      const id = await createAudit({ url: sub.website, result, email: sub.email, source: "monitoring", parent_id: sub.last_audit_id, paid: true, customer_email: sub.email });
      const delta = sub.last_score == null ? "" : ` (${result.score - sub.last_score >= 0 ? "+" : ""}${result.score - sub.last_score} since last month)`;
      await sendEmail(
        sub.email,
        `Monthly website report for ${result.meta.domain}: ${result.score}/100${delta}`,
        `Your monthly website health report is ready.\n\nScore: ${result.score}/100 (grade ${result.grade})${delta}\nOpen it: ${reportUrl(id)}\n\nReply to this email with any questions.`,
      ).catch(() => false);
      await subscriptionRan(sub.id, id, result.score);
      done.push(sub.website);
    } catch (e) {
      await notifyOwner("Monitoring run failed", `${sub.website}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return NextResponse.json({ processed: done.length, due: due.length });
}
