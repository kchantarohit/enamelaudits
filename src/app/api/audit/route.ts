import { NextResponse } from "next/server";
import { runAudit } from "@/lib/audit/engine";
import { AuditError } from "@/lib/audit/safe-fetch";
import { countRecentAudits, createAudit } from "@/lib/db";
import { clientIp, hashIp } from "@/lib/fulfil";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const HOURLY_LIMIT = 8;

export async function POST(req: Request) {
  let body: { url?: string; email?: string; business?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const url = String(body.url || "").slice(0, 300);
  const email = String(body.email || "").trim().slice(0, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }
  const ipHash = hashIp(clientIp(req));
  try {
    if ((await countRecentAudits(ipHash, 60)) >= HOURLY_LIMIT) {
      return NextResponse.json({ error: "You've run a lot of checks in the last hour. Please try again a bit later." }, { status: 429 });
    }
    const result = await runAudit(url);
    const id = await createAudit({
      url,
      result,
      email: email || null,
      business_name: String(body.business || "").slice(0, 200) || null,
      source: body.ref ? `web:${String(body.ref).slice(0, 40)}` : "web",
      ip_hash: ipHash,
    });
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
    console.error("audit failed", e);
    return NextResponse.json({ error: "Something went wrong running the check. Please try again." }, { status: 500 });
  }
}
