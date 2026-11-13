import { lookup } from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; EnamelAuditsBot/1.0; +https://enamelaudits.vercel.app/bot)";

export class AuditError extends Error {
  constructor(message: string, public code: string = "audit_failed") {
    super(message);
  }
}

const allowPrivate = () => process.env.ALLOW_PRIVATE_HOSTS === "1";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

/** Reject anything that isn't a public http(s) host on a standard port. */
export async function assertPublicUrl(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new AuditError("Only http and https websites can be checked.", "bad_url");
  if (u.username || u.password) throw new AuditError("Website addresses with logins aren't supported.", "bad_url");
  if (u.port && !["80", "443"].includes(u.port) && !allowPrivate()) throw new AuditError("Only standard web ports are supported.", "bad_url");
  if (allowPrivate()) return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new AuditError("That address isn't a public website.", "bad_url");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new AuditError("That address isn't a public website.", "bad_url");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new AuditError(`We couldn't find a website at ${host}. Check the spelling and try again.`, "dns");
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new AuditError("That address isn't a public website.", "bad_url");
}

export function normalizeUrl(input: string): URL {
  let s = (input || "").trim();
  if (!s) throw new AuditError("Please enter your website address.", "bad_url");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new AuditError("That doesn't look like a website address.", "bad_url");
  }
  if (!u.hostname.includes(".") && !allowPrivate()) throw new AuditError("That doesn't look like a website address.", "bad_url");
  u.hash = "";
  return u;
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  headers: Headers;
  body: string;
  bytes: number;
  ttfbMs: number;
  totalMs: number;
  redirects: string[];
}

interface FetchOpts {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  readBody?: boolean;
}

/** Fetch with manual redirects, SSRF checks at every hop, a timeout and a body cap. */
export async function safeFetch(input: string | URL, opts: FetchOpts = {}): Promise<FetchedPage> {
  const { method = "GET", timeoutMs = 12000, maxBytes = 3_000_000, maxRedirects = 6, readBody = true } = opts;
  const started = performance.now();
  const redirects: string[] = [];
  let current = new URL(input.toString());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertPublicUrl(current);
      const hopStart = performance.now();
      const res = await fetch(current, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br",
        },
      });
      const ttfbMs = Math.round(performance.now() - hopStart);
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        redirects.push(`${res.status} ${current.toString()}`);
        current = new URL(res.headers.get("location")!, current);
        await res.body?.cancel().catch(() => {});
        continue;
      }
      let body = "";
      let bytes = 0;
      if (readBody && method === "GET" && res.body) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes <= maxBytes) chunks.push(value);
          else {
            await reader.cancel().catch(() => {});
            break;
          }
        }
        body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
      } else {
        await res.body?.cancel().catch(() => {});
        bytes = Number(res.headers.get("content-length") || 0);
      }
      return {
        url: input.toString(),
        finalUrl: current.toString(),
        status: res.status,
        headers: res.headers,
        body,
        bytes,
        ttfbMs,
        totalMs: Math.round(performance.now() - started),
        redirects,
      };
    }
    throw new AuditError("The website redirected too many times.", "redirect_loop");
  } finally {
    clearTimeout(timer);
  }
}

/** Status-only probe used for link and asset checks. Falls back to GET when HEAD is refused. */
export async function probe(url: string, timeoutMs = 6000): Promise<{ status: number; bytes: number; error?: string }> {
  try {
    let r = await safeFetch(url, { method: "HEAD", timeoutMs, readBody: false });
    if (r.status === 405 || r.status === 403 || r.status === 501) {
      r = await safeFetch(url, { method: "GET", timeoutMs, maxBytes: 64_000 });
    }
    return { status: r.status, bytes: Number(r.headers.get("content-length") || r.bytes || 0) };
  } catch (e) {
    return { status: 0, bytes: 0, error: e instanceof Error ? e.message : "error" };
  }
}

export interface CertInfo {
  authorized: boolean;
  error?: string;
  validTo?: string;
  daysLeft?: number;
  issuer?: string;
}

export async function checkCertificate(host: string, timeoutMs = 7000): Promise<CertInfo | null> {
  if (allowPrivate()) return null;
  try {
    await assertPublicUrl(new URL(`https://${host}/`));
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: CertInfo | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert?.valid_to;
      const daysLeft = validTo ? Math.floor((new Date(validTo).getTime() - Date.now()) / 86_400_000) : undefined;
      done({
        authorized: socket.authorized,
        error: socket.authorizationError ? String(socket.authorizationError) : undefined,
        validTo,
        daysLeft,
        issuer: (cert?.issuer as { O?: string } | undefined)?.O,
      });
      socket.end();
    });
    socket.on("timeout", () => {
      socket.destroy();
      done(null);
    });
    socket.on("error", () => done(null));
  });
}

/** Run async tasks with a concurrency limit. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
