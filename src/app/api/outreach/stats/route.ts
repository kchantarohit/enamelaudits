import { NextResponse, type NextRequest } from "next/server";
import { stats } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Aggregate, anonymous stats for social posts (real numbers only). */
export async function GET(req: NextRequest) {
  const token = process.env.OUTREACH_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") || 30)));
  return NextResponse.json(await stats(days));
}
