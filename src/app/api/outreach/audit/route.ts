import { NextResponse } from "next/server";
import { runAudit } from "@/lib/audit/engine";
import { AuditError } from "@/lib/audit/safe-fetch";
import { rankIssues } from "@/lib/audit/score";
import { CHECK_BY_ID } from "@/lib/audit/catalog";
import { createAudit } from "@/lib/db";
import { reportUrl } from "@/lib/fulfil";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Token-protected audit endpoint used by the outreach scripts (no IP rate limit). */
export async function POST(req: Request) {
  const token = process.env.OUTREACH_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { url, business, campaign } = (await req.json().catch(() => ({}))) as { url?: string; business?: string; campaign?: string };
  try {
    const result = await runAudit(String(url || ""));
    const id = await createAudit({ url: String(url), result, business_name: business || null, source: `outreach:${(campaign || "default").slice(0, 30)}` });
    const issues = rankIssues(result.checks).map((c) => ({ id: c.id, status: c.status, issue: CHECK_BY_ID[c.id].issue, detail: c.detail }));
    return NextResponse.json({
      id,
      reportUrl: reportUrl(id),
      domain: result.meta.domain,
      score: result.score,
      grade: result.grade,
      platform: result.meta.platform,
      issueCount: issues.length,
      topIssues: issues.slice(0, 3),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AuditError ? e.message : "audit failed" }, { status: 422 });
  }
}
