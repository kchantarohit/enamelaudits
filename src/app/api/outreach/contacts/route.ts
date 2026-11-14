import { NextResponse } from "next/server";
import { outreachEnqueue, outreachKnown, outreachNext, outreachNextDay, outreachPeek, outreachResult, outreachStats, outreachSuppress, type OutreachLead } from "@/lib/db";
import { unsubscribeApiUrl, unsubscribeUrl } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

const HARD_DAILY_CAP = 20; // never more than this in any rolling 24 hours, whatever the caller asks

function domainOf(v: string) {
  try {
    return new URL(/^https?:/i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Token-protected queue for the Gmail outreach script.
 * Actions: enqueue | known | peek | next | result | suppress | stats
 */
export async function POST(req: Request) {
  const token = process.env.OUTREACH_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const withLinks = <T extends { email: string }>(c: T) => ({ ...c, unsubscribeUrl: unsubscribeUrl(c.email), unsubscribeApiUrl: unsubscribeApiUrl(c.email) });

  try {
    switch (body.action) {
      case "enqueue": {
        const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 2000).map((r: Record<string, unknown>) => {
          const website = String(r.website || r.domain || "");
          return {
            email: String(r.email || "").trim(),
            domain: String(r.domain || "") || domainOf(website),
            website,
            name: String(r.name || ""),
            first_name: String(r.first_name || ""),
            city: String(r.city || ""),
            source: String(r.source || "csv"),
            // The lead finder records clinics it screened out as "skipped" so they are never re-audited.
            status: r.status === "skipped" ? "skipped" : "queued",
            score: Number.isFinite(Number(r.score)) && r.score !== "" && r.score != null ? Math.round(Number(r.score)) : null,
            grade: String(r.grade || "").slice(0, 2),
            issue_count: Number.isFinite(Number(r.issue_count)) && r.issue_count !== "" && r.issue_count != null ? Math.round(Number(r.issue_count)) : null,
            reason: String(r.reason || "").slice(0, 300),
          } satisfies OutreachLead;
        });
        return NextResponse.json(await outreachEnqueue(rows));
      }
      case "known": {
        const domains = (Array.isArray(body.domains) ? body.domains : []).slice(0, 2000).map((d) => domainOf(String(d))).filter(Boolean);
        return NextResponse.json({ known: domains.length ? await outreachKnown(domains) : [] });
      }
      case "peek": {
        const limit = Math.min(50, Math.max(1, Number(body.limit) || 15));
        return NextResponse.json({ contacts: (await outreachPeek(limit)).map(withLinks) });
      }
      case "next": {
        const limit = Math.min(HARD_DAILY_CAP, Math.max(1, Number(body.limit) || 15));
        const cap = Math.min(HARD_DAILY_CAP, Math.max(1, Number(body.dailyCap) || HARD_DAILY_CAP));
        if (body.dayCap != null) {
          // Calendar-day cap (e.g. 9 per US Central business day) on top of the rolling 24 h cap.
          const dayCap = Math.min(cap, Math.max(1, Number(body.dayCap) || cap));
          const tz = /^[A-Za-z_]+\/[A-Za-z_]+$/.test(String(body.tz || "")) ? String(body.tz) : "America/Chicago";
          const r = await outreachNextDay(limit, cap, dayCap, tz);
          return NextResponse.json({ ...r, contacts: r.contacts.map(withLinks) });
        }
        const r = await outreachNext(limit, cap);
        return NextResponse.json({ ...r, contacts: r.contacts.map(withLinks) });
      }
      case "result": {
        const status = String(body.status);
        if (!["sent", "skipped", "failed"].includes(status) || typeof body.id !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });
        await outreachResult(body.id, status as "sent" | "skipped" | "failed", (body.data as Record<string, unknown>) || {});
        return NextResponse.json({ ok: true });
      }
      case "suppress": {
        await outreachSuppress(String(body.value || ""), String(body.reason || "manual"));
        return NextResponse.json({ ok: true });
      }
      case "stats":
        return NextResponse.json(await outreachStats());
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("outreach contacts failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
