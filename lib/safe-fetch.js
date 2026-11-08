// Outbound fetch that refuses to talk to private / internal networks (SSRF guard),
// follows redirects manually so every hop is re-checked, and enforces timeouts + size caps.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const UA = 'EnamelAuditsBot/1.0 (+website health check; public pages only)';

export class FetchError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, mask]) => ((n & mask) >>> 0) === base);
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (lower === '::' || lower === '::1') return true;
    if (/^f[cd]/.test(lower)) return true;        // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return true;     // fe80::/10 link local
    if (/^ff/.test(lower)) return true;           // multicast
    if (lower.startsWith('64:ff9b:')) return true; // NAT64
    return false;
  }
  return true;
}

/** Normalise user input ("example.com", "http://x.com/path") into a URL object or throw. */
export function normalizeUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new FetchError('Please enter a website address.', 'invalid_url');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u;
  try { u = new URL(raw); } catch { throw new FetchError('That does not look like a valid website address.', 'invalid_url'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new FetchError('Only http and https websites can be checked.', 'invalid_url');
  if (u.username || u.password) throw new FetchError('Website addresses with passwords are not supported.', 'invalid_url');
  if (!ALLOW_PRIVATE && u.port && !['80', '443'].includes(u.port)) throw new FetchError('Only standard web ports (80/443) are supported.', 'invalid_url');
  const host = u.hostname.toLowerCase();
  if (!ALLOW_PRIVATE && (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost' || host.endsWith('.localhost'))) {
    throw new FetchError('Please enter a public website address.', 'invalid_url');
  }
  u.hash = '';
  return u;
}

// Dev/test escape hatch ONLY. Never set this in production.
const ALLOW_PRIVATE = process.env.AUDIT_ALLOW_PRIVATE === '1' && process.env.VERCEL !== '1';

export async function assertPublicHost(hostname) {
  if (ALLOW_PRIVATE) return;
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new FetchError('That address points to a private network.', 'blocked_host');
    return;
  }
  let addrs;
  try { addrs = await lookup(host, { all: true }); }
  catch { throw new FetchError(`We couldn't find a website at ${host}. Check the spelling.`, 'dns_failed'); }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) {
    throw new FetchError('That address points to a private network.', 'blocked_host');
  }
}

/**
 * Fetch a public URL safely.
 * @returns {Promise<{url:string,status:number,headers:Headers,body:string,bytes:number,ms:number,ttfbMs:number,redirects:string[]}>}
 */
export async function safeFetch(input, { method = 'GET', timeoutMs = 10000, maxBytes = 3_000_000, maxRedirects = 5, readBody = true } = {}) {
  let url = input instanceof URL ? new URL(input.href) : normalizeUrl(input);
  const redirects = [];
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!ALLOW_PRIVATE && url.port && !['80', '443'].includes(url.port)) throw new FetchError('Redirected to a non-standard port.', 'blocked_host');
      await assertPublicHost(url.hostname);
      let res;
      try {
        res = await fetch(url, {
          method, redirect: 'manual', signal: controller.signal,
          headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9' },
        });
      } catch (e) {
        if (controller.signal.aborted) throw new FetchError('The website took too long to respond.', 'timeout');
        const cause = e.cause?.code || e.cause?.message || e.message;
        if (/CERT|SSL|TLS|self.signed|UNABLE_TO_VERIFY/i.test(String(cause))) throw new FetchError(`SSL certificate problem: ${cause}`, 'tls_error');
        throw new FetchError(`Could not connect to the website (${cause}).`, 'connect_failed');
      }
      const ttfbMs = Date.now() - started;
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        await res.body?.cancel().catch(() => {});
        const next = new URL(res.headers.get('location'), url);
        if (!['http:', 'https:'].includes(next.protocol)) throw new FetchError('Redirected to an unsupported address.', 'blocked_host');
        redirects.push(next.href);
        url = next;
        continue;
      }
      let body = '';
      let bytes = 0;
      if (readBody && method !== 'HEAD' && res.body) {
        const reader = res.body.getReader();
        const chunks = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) { await reader.cancel().catch(() => {}); break; }
          chunks.push(value);
        }
        body = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
      } else {
        await res.body?.cancel().catch(() => {});
        bytes = Number(res.headers.get('content-length') || 0);
      }
      return { url: url.href, status: res.status, headers: res.headers, body, bytes, ms: Date.now() - started, ttfbMs, redirects };
    }
    throw new FetchError('Too many redirects.', 'too_many_redirects');
  } finally {
    clearTimeout(timer);
  }
}
