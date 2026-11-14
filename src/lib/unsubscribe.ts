import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE } from "./site";

function sign(email: string) {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not configured");
  return createHmac("sha256", secret).update(`unsubscribe:${email.toLowerCase()}`).digest("hex").slice(0, 32);
}

/** Signed one-click unsubscribe link for an email address (no login, can't be forged). */
export function unsubscribeUrl(email: string) {
  const e = Buffer.from(email.toLowerCase()).toString("base64url");
  return `${SITE.url}/unsubscribe?e=${e}&t=${sign(email)}`;
}

/** The RFC 8058 one-click endpoint used in the List-Unsubscribe header. */
export function unsubscribeApiUrl(email: string) {
  const e = Buffer.from(email.toLowerCase()).toString("base64url");
  return `${SITE.url}/api/unsubscribe?e=${e}&t=${sign(email)}`;
}

export function verifyUnsubscribe(e: string | null, t: string | null): string | null {
  if (!e || !t) return null;
  let email: string;
  try {
    email = Buffer.from(e, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const expected = Buffer.from(sign(email));
  const given = Buffer.from(t);
  return expected.length === given.length && timingSafeEqual(expected, given) ? email.toLowerCase() : null;
}
