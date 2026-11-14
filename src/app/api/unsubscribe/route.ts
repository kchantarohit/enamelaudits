import { NextResponse, type NextRequest } from "next/server";
import { outreachSuppress } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click unsubscribe (mail clients POST here) and the confirm form. */
export async function POST(req: NextRequest) {
  const email = verifyUnsubscribe(req.nextUrl.searchParams.get("e"), req.nextUrl.searchParams.get("t"));
  if (!email) return NextResponse.json({ error: "invalid link" }, { status: 400 });
  await outreachSuppress(email, "unsubscribe link");
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/html")) return NextResponse.redirect(new URL("/unsubscribe?done=1", req.url), 303);
  return NextResponse.json({ ok: true });
}

/** GETs only show the confirmation page: link scanners must not unsubscribe people. */
export async function GET(req: NextRequest) {
  const u = new URL("/unsubscribe", req.url);
  u.search = req.nextUrl.search;
  return NextResponse.redirect(u, 303);
}
