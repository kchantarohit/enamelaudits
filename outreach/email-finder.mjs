// Find a contact email a dental practice publishes on its own website (home page + usual contact pages).
// Keeps an address on the practice's own domain, or a common mailbox provider (gmail.com etc.) shown on
// the site. Addresses on any other domain are ignored (usually the web agency or a vendor, not the clinic).
import { domainOf, sleep } from "./lib.mjs";

export const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "me.com", "msn.com", "live.com", "sbcglobal.net", "att.net", "comcast.net", "verizon.net", "bellsouth.net", "protonmail.com"]);
const JUNK = /(example\.|sentry|wixpress|domain\.com|yourdomain|email\.com|\.(png|jpe?g|gif|webp|svg)$|@2x|noreply|no-reply|donotreply|privacy@|webmaster@|hipaa@|billing@|careers@|jobs@|hr@)/i;
const UA = "Mozilla/5.0 (compatible; EnamelAuditsBot/1.0; +https://enamelaudits.vercel.app/bot)";

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": UA, accept: "text/html" } });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") || "html")) return "";
    return (await res.text()).slice(0, 1_500_000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

/** @returns {Promise<string>} a lower-case email address, or "" if the site publishes none we can use */
export async function findEmail(website) {
  const base = /^https?:/i.test(website) ? website : `https://${website}`;
  const site = domainOf(base);
  if (!site) return "";
  const pages = [base, "/contact", "/contact-us", "/contact-us/", "/contact/", "/about-us"].map((p) => (p.startsWith("/") ? new URL(p, base).toString() : p));
  const found = new Set();
  for (const p of pages) {
    const html = await get(p);
    if (!html) continue;
    const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    });
    const plain = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const e of [...mailtos, ...plain]) {
      const email = e.toLowerCase().replace(/^\/+/, "").trim();
      if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) && !JUNK.test(email)) found.add(email);
    }
    const own = [...found].find((e) => e.endsWith("@" + site) || e.endsWith("." + site));
    if (own) return own;
    await sleep(300);
  }
  return [...found].find((e) => FREE_MAIL.has(e.split("@")[1])) || "";
}
