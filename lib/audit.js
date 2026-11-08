// The audit engine: fetches a practice's public home page and scores it across 8 categories.
import tls from 'node:tls';
import { safeFetch, normalizeUrl, FetchError } from './safe-fetch.js';
import { stripComments, findTags, findElements, textContent, metaContent } from './html.js';

export const CATEGORIES = [
  { key: 'speed', label: 'Speed', weight: 20 },
  { key: 'security', label: 'Security', weight: 15 },
  { key: 'seo', label: 'SEO basics', weight: 15 },
  { key: 'mobile', label: 'Mobile', weight: 10 },
  { key: 'access', label: 'Accessibility basics', weight: 10 },
  { key: 'patient', label: 'Patient actions', weight: 15 },
  { key: 'local', label: 'Local SEO', weight: 10 },
  { key: 'links', label: 'Broken links', weight: 5 },
];

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

const BOOKING_VENDORS = /zocdoc|nexhealth|localmed|solutionreach|lighthouse360|flexbook|modento|yapiapp|carestack|dentrix|weave|patientpop|doctible|sesamecommunications|opencare|denticon|curve\.dental|calendly|acuityscheduling|squareup\.com\/appointments|setmore|simplybook|booksy|vagaro|jane\.app|healthgrades|tebra|kareo|rhinogram|dentalhq|adit\.com|revenuewell|appointment/i;
const BOOKING_TEXT = /\b(book|booking|appointment|schedule|request (a|an|your) (visit|appointment)|reserve)\b/i;

export function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

class Scorer {
  constructor() { this.checks = []; }
  /**
   * @param {string} category
   * @param {number} credit 0..1 (1 = pass)
   * @param {number} weight
   * @param {{title:string, impact?:string, fix?:string, severity?:'high'|'medium'|'low', pass:string}} info
   */
  add(category, credit, weight, info) {
    const c = Math.max(0, Math.min(1, Number(credit) || 0));
    this.checks.push({ category, credit: c, weight, ...info });
  }
  result() {
    const categories = CATEGORIES.map(cat => {
      const items = this.checks.filter(c => c.category === cat.key);
      const total = items.reduce((s, c) => s + c.weight, 0);
      const got = items.reduce((s, c) => s + c.weight * c.credit, 0);
      return { ...cat, score: total ? Math.round((got / total) * 100) : null };
    });
    const scored = categories.filter(c => c.score !== null);
    const wTotal = scored.reduce((s, c) => s + c.weight, 0);
    const score = wTotal ? Math.round(scored.reduce((s, c) => s + c.score * c.weight, 0) / wTotal) : 0;
    const findings = this.checks
      .filter(c => c.credit < 1)
      .map(c => ({ category: c.category, severity: c.severity || 'medium', title: c.title, impact: c.impact || '', fix: c.fix || '', weight: c.weight * (1 - c.credit) }))
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.weight - a.weight);
    const passed = this.checks.filter(c => c.credit >= 1).map(c => ({ category: c.category, title: c.pass }));
    return { score, grade: gradeFor(score), categories, findings, passed };
  }
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise(r => setTimeout(() => r(fallback), ms))]);
}

async function tryFetch(url, opts) {
  try { return await safeFetch(url, opts); } catch (e) { return { error: e }; }
}

function certInfo(hostname) {
  return new Promise(resolve => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: 6000 }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      const authError = socket.authorizationError ? String(socket.authorizationError) : null;
      socket.end();
      if (!cert || !cert.valid_to) return resolve(null);
      resolve({ validTo: new Date(cert.valid_to), authorized, authError, issuer: cert.issuer?.O || cert.issuer?.CN || '' });
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

async function pageSpeed(url, key) {
  if (!key) return null;
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&key=${encodeURIComponent(key)}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 28000);
    const res = await fetch(api, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    const lh = j.lighthouseResult;
    if (!lh) return null;
    return {
      score: Math.round((lh.categories?.performance?.score ?? 0) * 100),
      lcp: lh.audits?.['largest-contentful-paint']?.displayValue || null,
      cls: lh.audits?.['cumulative-layout-shift']?.displayValue || null,
      tbt: lh.audits?.['total-blocking-time']?.displayValue || null,
    };
  } catch { return null; }
}

async function checkLinks(urls, { concurrency = 5, timeoutMs = 5000, deadline }) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < urls.length && deadline - Date.now() > 1500) {
      const { href, internal } = urls[i++];
      const t = () => Math.max(500, Math.min(timeoutMs, deadline - Date.now()));
      let r = await tryFetch(href, { method: 'HEAD', timeoutMs: t(), readBody: false });
      if (!r.error && [403, 405, 501, 400].includes(r.status) && deadline - Date.now() > 1000) r = await tryFetch(href, { method: 'GET', timeoutMs: t(), maxBytes: 50_000 });
      if (r.error) {
        // Ignore our own SSRF block; treat timeouts on third-party sites as inconclusive.
        // Third-party sites often block bots; only a dead domain counts as broken for them.
        if (r.error.code === 'blocked_host' || (!internal && r.error.code !== 'dns_failed')) continue;
        results.push({ href, ok: false, status: r.error.code });
      } else {
        const ok = internal ? r.status < 400 : !(r.status === 404 || r.status === 410 || r.status >= 500);
        results.push({ href, ok, status: r.status });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/**
 * Run a website health audit.
 * @param {string} input website address
 * @param {{pagespeedKey?:string, budgetMs?:number, maxLinks?:number, now?:Date}} opts
 */
export async function runAudit(input, opts = {}) {
  const startedAt = Date.now();
  // Hard time budget so the audit always fits inside serverless limits (Netlify free: 30s per function).
  const budgetMs = opts.budgetMs ?? 18000;
  const deadline = startedAt + budgetMs;
  const left = (cap, reserve = 500) => Math.max(500, Math.min(cap, deadline - Date.now() - reserve));
  const now = opts.now || new Date();
  const target = normalizeUrl(input);
  const s = new Scorer();

  // 1. Home page. Try https first, fall back to http if needed.
  let page = await tryFetch(target, { timeoutMs: Math.min(10000, Math.round(budgetMs * 0.45)) });
  if (page.error && target.protocol === 'https:' && ['connect_failed', 'tls_error'].includes(page.error.code)) {
    const httpUrl = new URL(target.href); httpUrl.protocol = 'http:';
    const alt = await tryFetch(httpUrl, { timeoutMs: left(6000, budgetMs * 0.3) });
    if (!alt.error) page = { ...alt, httpsError: page.error };
  }
  if (page.error) throw page.error;
  if (page.status >= 400) throw new FetchError(`The website returned an error (HTTP ${page.status}), so it could not be checked.`, 'http_error');

  const finalUrl = new URL(page.url);
  const isHttps = finalUrl.protocol === 'https:';
  const html = stripComments(page.body);
  const headLen = html.search(/<\/head>/i);
  const head = headLen > 0 ? html.slice(0, headLen) : html.slice(0, 20000);
  const text = textContent(html);
  const anchors = findTags(html, 'a');
  const anchorEls = findElements(html, 'a');
  const imgs = findTags(html, 'img');
  const scripts = findTags(html, 'script');
  const links = findTags(html, 'link');
  const origin = finalUrl.origin;

  // 2. Parallel side checks.
  const httpVersion = new URL(finalUrl.href); httpVersion.protocol = 'http:';
  const linkTargets = collectLinks(anchors, finalUrl, opts.maxLinks ?? 20);
  const isSitemap = r => !r.error && r.status === 200 && /<(urlset|sitemapindex)/i.test(r.body);
  const [httpRes, robots, certs, psi, linkResults, ...sitemaps] = await Promise.all([
    isHttps ? tryFetch(httpVersion, { timeoutMs: left(6000), readBody: false, method: 'GET' }) : Promise.resolve(null),
    tryFetch(new URL('/robots.txt', origin), { timeoutMs: left(5000), maxBytes: 200_000 }),
    isHttps ? withTimeout(certInfo(finalUrl.hostname), left(6000), null) : Promise.resolve(null),
    withTimeout(pageSpeed(finalUrl.href, opts.pagespeedKey), left(30000), null),
    checkLinks(linkTargets, { deadline: deadline - 500 }),
    ...['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'].map(p => tryFetch(new URL(p, origin), { timeoutMs: left(5000), maxBytes: 100_000 })),
  ]);
  const robotsTxt = !robots.error && robots.status === 200 && !/<html/i.test(robots.body) ? robots.body : null;
  const sitemapFound = (robotsTxt && /^\s*sitemap\s*:/im.test(robotsTxt)) || sitemaps.some(isSitemap);

  // ---------- Speed ----------
  const ttfb = page.ttfbMs;
  s.add('speed', ttfb < 800 ? 1 : ttfb < 1800 ? 0.5 : 0, 3, {
    severity: ttfb < 1800 ? 'medium' : 'high',
    title: `Server responded slowly (${(ttfb / 1000).toFixed(1)}s).`,
    impact: 'Patients on phones wait before anything appears. Many leave after a few seconds.',
    fix: 'Ask your host about server caching (or a caching plugin on WordPress) and a CDN such as Cloudflare.',
    pass: `Fast server response (${(ttfb / 1000).toFixed(1)}s).`,
  });
  const kb = Math.round(page.bytes / 1024);
  s.add('speed', kb < 200 ? 1 : kb < 500 ? 0.5 : 0, 2, {
    severity: 'medium',
    title: `Home page HTML is heavy (${kb} KB).`,
    impact: 'Large pages take longer to download on mobile data.',
    fix: 'Remove unused page-builder sections, inline styles, and embedded widgets you no longer need.',
    pass: `Lean home page HTML (${kb} KB).`,
  });
  const reqCount = scripts.filter(t => t.src).length + links.filter(t => /stylesheet/i.test(t.rel || '')).length + imgs.length;
  s.add('speed', reqCount <= 50 ? 1 : reqCount <= 90 ? 0.5 : 0, 2, {
    severity: 'medium',
    title: `Lots of files to load (${reqCount} scripts, stylesheets and images).`,
    impact: 'Every extra file adds loading time, especially on phones.',
    fix: 'Remove unused plugins and tracking scripts, and combine or defer the rest.',
    pass: `Reasonable number of files to load (${reqCount}).`,
  });
  const blocking = findTags(head, 'script').filter(t => t.src && !('async' in t) && !('defer' in t) && !/module|json/i.test(t.type || '')).length;
  s.add('speed', blocking <= 2 ? 1 : blocking <= 6 ? 0.5 : 0, 2, {
    severity: 'low',
    title: `${blocking} scripts block the page from showing.`,
    impact: 'The browser waits for these scripts before it draws the page.',
    fix: 'Add the "defer" attribute to non-critical scripts or move them to the end of the page.',
    pass: 'Few render-blocking scripts.',
  });
  const enc = page.headers.get('content-encoding') || '';
  s.add('speed', /gzip|br|zstd|deflate/i.test(enc) ? 1 : 0, 1, {
    severity: 'low',
    title: 'Text compression is not enabled.',
    impact: 'Pages are sent uncompressed, so they take longer to download.',
    fix: 'Enable gzip or Brotli compression in your hosting control panel or CDN.',
    pass: 'Text compression enabled.',
  });
  if (imgs.length > 6) {
    const lazy = imgs.filter(i => /lazy/i.test(i.loading || '') || i['data-src'] || i['data-lazy-src']).length;
    s.add('speed', lazy > 0 ? 1 : 0, 1, {
      severity: 'low',
      title: `None of the ${imgs.length} images load lazily.`,
      impact: 'Images far down the page are downloaded before the visitor ever scrolls to them.',
      fix: 'Add loading="lazy" to images below the top of the page.',
      pass: 'Images below the fold load lazily.',
    });
  }
  if (psi) {
    s.add('speed', psi.score / 100, 4, {
      severity: psi.score < 50 ? 'high' : 'medium',
      title: `Google mobile performance score is ${psi.score}/100${psi.lcp ? ` (main content appears after ${psi.lcp})` : ''}.`,
      impact: 'Google uses page experience as a ranking signal, and slow phones lose impatient patients.',
      fix: 'Compress and resize large images (WebP), remove unused plugins, and enable caching.',
      pass: `Strong Google mobile performance score (${psi.score}/100).`,
    });
  }

  // ---------- Security ----------
  s.add('security', isHttps ? 1 : 0, 4, {
    severity: 'high',
    title: page.httpsError ? `Secure connection (HTTPS) is broken: ${page.httpsError.message}` : 'Website is not using a secure connection (HTTPS).',
    impact: 'Browsers label the site "Not secure", which scares patients away from forms and booking.',
    fix: 'Install a free SSL certificate (most hosts offer Let\'s Encrypt in one click) and redirect all pages to https://.',
    pass: 'Secure connection (HTTPS) in use.',
  });
  if (isHttps && httpRes) {
    const redirected = !httpRes.error && new URL(httpRes.url).protocol === 'https:';
    s.add('security', redirected ? 1 : 0, 2, {
      severity: 'medium',
      title: 'The http:// version of your site does not redirect to https://.',
      impact: 'Visitors who type your address may land on an insecure page.',
      fix: 'Add a permanent (301) redirect from http:// to https:// in your hosting settings.',
      pass: 'http:// redirects to the secure version.',
    });
  }
  if (certs) {
    const days = Math.floor((certs.validTo - now) / 86400000);
    s.add('security', certs.authorized && days > 14 ? 1 : 0, 2, {
      severity: 'high',
      title: !certs.authorized ? `SSL certificate is not trusted (${certs.authError}).` : `SSL certificate expires in ${days} days.`,
      impact: 'When the certificate expires, browsers show a full-page security warning.',
      fix: 'Make sure your SSL certificate auto-renews. Ask your host to confirm.',
      pass: `Valid SSL certificate (${days} days left).`,
    });
  }
  const h = n => page.headers.get(n);
  const csp = h('content-security-policy') || '';
  if (isHttps) {
    s.add('security', h('strict-transport-security') ? 1 : 0, 1, {
      severity: 'low', title: 'Missing HSTS security header.',
      impact: 'Browsers are not told to always use the secure version of your site.',
      fix: 'Add the header: Strict-Transport-Security: max-age=31536000',
      pass: 'HSTS header set.',
    });
  }
  s.add('security', /nosniff/i.test(h('x-content-type-options') || '') ? 1 : 0, 1, {
    severity: 'low', title: 'Missing X-Content-Type-Options header.',
    impact: 'A basic protection against some file-type attacks is off.',
    fix: 'Add the header: X-Content-Type-Options: nosniff',
    pass: 'X-Content-Type-Options header set.',
  });
  s.add('security', h('x-frame-options') || /frame-ancestors/i.test(csp) ? 1 : 0, 1, {
    severity: 'low', title: 'Site can be embedded inside other websites (no clickjacking protection).',
    impact: 'Other sites could frame your pages to trick visitors.',
    fix: 'Add the header: X-Frame-Options: SAMEORIGIN',
    pass: 'Clickjacking protection header set.',
  });
  s.add('security', h('referrer-policy') ? 1 : 0, 0.5, {
    severity: 'low', title: 'Missing Referrer-Policy header.',
    impact: 'Full page addresses may be shared with third-party sites.',
    fix: 'Add the header: Referrer-Policy: strict-origin-when-cross-origin',
    pass: 'Referrer-Policy header set.',
  });
  if (isHttps) {
    const mixed = [...html.matchAll(/<(?:img|script|iframe|source|link)\b[^>]*\s(?:src|href)\s*=\s*["']http:\/\/[^"']+/gi)]
      .filter(m => !/<link\b/i.test(m[0]) || /stylesheet/i.test(m[0])).length;
    s.add('security', mixed === 0 ? 1 : 0, 2, {
      severity: 'medium', title: `${mixed} files load over insecure http:// on a secure page.`,
      impact: 'Browsers may block these files or remove the padlock icon.',
      fix: 'Change those image/script addresses to https:// (a "search and replace" plugin can do this on WordPress).',
      pass: 'No insecure (mixed) content.',
    });
  }

  // ---------- SEO ----------
  const titleEl = findElements(html, 'title')[0];
  const title = titleEl ? textContent(titleEl.inner) : '';
  s.add('seo', title.length >= 10 && title.length <= 70 ? 1 : title ? 0.5 : 0, 3, {
    severity: title ? 'medium' : 'high',
    title: !title ? 'Home page has no title.' : `Page title is ${title.length < 10 ? 'too short' : 'too long'} (${title.length} characters).`,
    impact: 'The title is the blue headline patients see on Google.',
    fix: 'Use 50–60 characters, e.g. "Family Dentist in [Town] | [Practice Name]".',
    pass: `Good page title: "${title.slice(0, 70)}"`,
  });
  const desc = metaContent(head, 'description') || '';
  s.add('seo', desc.length >= 50 && desc.length <= 170 ? 1 : desc ? 0.5 : 0, 3, {
    severity: 'medium',
    title: !desc ? 'No meta description on the home page.' : `Meta description is ${desc.length < 50 ? 'too short' : 'too long'} (${desc.length} characters).`,
    impact: 'Google picks random text from the page for your search listing.',
    fix: 'Add a 1–2 sentence description (120–160 characters) of your practice, location and services.',
    pass: 'Meta description present.',
  });
  const h1s = findElements(html, 'h1').filter(e => textContent(e.inner));
  s.add('seo', h1s.length === 1 ? 1 : h1s.length > 1 ? 0.5 : 0, 2, {
    severity: 'medium',
    title: h1s.length ? `${h1s.length} main headings (H1) on the home page.` : 'No main heading (H1) on the home page.',
    impact: 'Google uses the main heading to understand what the page is about.',
    fix: 'Use exactly one H1 that says what you do and where, e.g. "Gentle Family Dentistry in [Town]".',
    pass: 'One clear main heading (H1).',
  });
  const robotsMeta = (metaContent(head, 'robots') || '') + ' ' + (page.headers.get('x-robots-tag') || '');
  s.add('seo', /noindex/i.test(robotsMeta) ? 0 : 1, 4, {
    severity: 'high', title: 'The home page tells Google NOT to list it (noindex).',
    impact: 'Your practice may not appear in Google search at all.',
    fix: 'Remove the "noindex" robots tag. On WordPress, untick "Discourage search engines" under Settings > Reading.',
    pass: 'Page is open to search engines.',
  });
  s.add('seo', links.some(l => /canonical/i.test(l.rel || '') && l.href) ? 1 : 0, 1, {
    severity: 'low', title: 'No canonical tag.',
    impact: 'Google may treat duplicate versions of your page as separate pages.',
    fix: 'Add <link rel="canonical" href="https://yourdomain.com/"> (most SEO plugins do this automatically).',
    pass: 'Canonical tag present.',
  });
  s.add('seo', robotsTxt ? 1 : 0, 1, {
    severity: 'low', title: 'No robots.txt file.',
    impact: 'Search engines get no crawling guidance for your site.',
    fix: 'Add a simple robots.txt with a link to your sitemap.',
    pass: 'robots.txt present.',
  });
  s.add('seo', sitemapFound ? 1 : 0, 2, {
    severity: 'medium', title: 'No XML sitemap found.',
    impact: 'Google may miss service and location pages.',
    fix: 'Generate a sitemap (Yoast / Rank Math on WordPress, built-in on Wix and Squarespace) and submit it in Google Search Console.',
    pass: 'XML sitemap found.',
  });
  s.add('seo', metaContent(head, 'og:title') && metaContent(head, 'og:image') ? 1 : 0, 1, {
    severity: 'low', title: 'Missing social sharing tags (Open Graph).',
    impact: 'When patients share your site on Facebook or text, it shows no image or a messy preview.',
    fix: 'Add og:title, og:description and og:image tags (most SEO plugins have a "Social" tab).',
    pass: 'Social sharing tags present.',
  });

  // ---------- Mobile ----------
  const viewport = metaContent(head, 'viewport') || '';
  s.add('mobile', /width\s*=\s*device-width/i.test(viewport) ? 1 : 0, 4, {
    severity: 'high', title: 'Site is not set up for phones (no mobile viewport).',
    impact: 'On phones the page shows tiny, zoomed-out text. Most new patients search on a phone.',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and use a responsive theme.',
    pass: 'Mobile viewport set.',
  });
  s.add('mobile', /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport) ? 0 : 1, 1, {
    severity: 'medium', title: 'Zooming is disabled on phones.',
    impact: 'Patients with poor eyesight cannot pinch to zoom.',
    fix: 'Remove "user-scalable=no" and "maximum-scale=1" from the viewport tag.',
    pass: 'Pinch-to-zoom allowed.',
  });
  s.add('mobile', links.some(l => /apple-touch-icon|icon/i.test(l.rel || '')) ? 1 : 0, 1, {
    severity: 'low', title: 'No site icon (favicon).',
    impact: 'Browser tabs and phone bookmarks show a blank icon instead of your logo.',
    fix: 'Upload a square logo as the site icon (WordPress: Appearance > Customize > Site Identity).',
    pass: 'Site icon present.',
  });

  // ---------- Accessibility basics ----------
  if (imgs.length) {
    const withAlt = imgs.filter(i => 'alt' in i || /aria-hidden|presentation/i.test(i._raw)).length;
    s.add('access', withAlt / imgs.length, 3, {
      severity: withAlt / imgs.length < 0.5 ? 'medium' : 'low',
      title: `${imgs.length - withAlt} of ${imgs.length} images have no alt text.`,
      impact: 'Screen-reader users hear nothing useful, and Google can\'t understand the images.',
      fix: 'Add a short description to each image\'s "alt text" field (decorative images can use alt="").',
      pass: 'All images have alt text.',
    });
  }
  const inputs = findTags(html, 'input').filter(i => !/hidden|submit|button|image|reset/i.test(i.type || 'text'))
    .concat(findTags(html, 'textarea'), findTags(html, 'select'));
  if (inputs.length) {
    const labelFor = new Set(findTags(html, 'label').map(l => l.for).filter(Boolean));
    const labelled = inputs.filter(i => i['aria-label'] || i['aria-labelledby'] || i.title || (i.id && labelFor.has(i.id)) || isInsideLabel(html, i._index)).length;
    s.add('access', labelled / inputs.length, 2, {
      severity: 'low',
      title: `${inputs.length - labelled} of ${inputs.length} form fields have no label.`,
      impact: 'Screen readers can\'t tell patients what to type in those fields.',
      fix: 'Give every form field a visible <label>. Placeholder text alone is not enough.',
      pass: 'Form fields are labelled.',
    });
  }
  const htmlTag = findTags(html, 'html')[0] || {};
  s.add('access', htmlTag.lang ? 1 : 0, 1, {
    severity: 'low', title: 'Page language is not declared.',
    impact: 'Screen readers may read your site in the wrong accent or language.',
    fix: 'Add lang="en" (or your language) to the <html> tag.',
    pass: 'Page language declared.',
  });
  const emptyLinks = anchorEls.filter(a => !a.attrs['aria-label'] && !a.attrs.title && !textContent(a.inner) && !/alt\s*=\s*["'][^"']+/i.test(a.inner)).length;
  if (anchorEls.length) {
    s.add('access', emptyLinks === 0 ? 1 : emptyLinks <= 3 ? 0.5 : 0, 1, {
      severity: 'low', title: `${emptyLinks} ${emptyLinks === 1 ? 'link has' : 'links have'} no readable text (e.g. icon-only social links).`,
      impact: 'Screen-reader users hear "link" with no idea where it goes.',
      fix: 'Add an aria-label such as "Our Facebook page" to icon-only links.',
      pass: 'All links have readable text.',
    });
  }

  // ---------- Patient actions ----------
  const hrefs = anchors.map(a => a.href || '');
  const hasTel = hrefs.some(x => /^tel:/i.test(x.trim()));
  s.add('patient', hasTel ? 1 : 0, 4, {
    severity: 'high', title: 'Phone number isn\'t tap-to-call.',
    impact: 'Mobile visitors have to copy your number by hand, and many won\'t bother.',
    fix: 'Wrap the phone number in a link: <a href="tel:+15551234567">(555) 123-4567</a>.',
    pass: 'Tap-to-call phone link present.',
  });
  const hasBooking = anchorEls.some(a => BOOKING_TEXT.test(textContent(a.inner)) || BOOKING_VENDORS.test(a.attrs.href || ''))
    || findTags(html, 'iframe').some(f => BOOKING_VENDORS.test(f.src || ''))
    || scripts.some(sc => BOOKING_VENDORS.test(sc.src || ''));
  s.add('patient', hasBooking ? 1 : 0, 3, {
    severity: 'high', title: 'No online booking or appointment link on the home page.',
    impact: 'Patients ready to book at 9pm can\'t, so they choose a practice that lets them.',
    fix: 'Add a prominent "Book an appointment" button near the top that links to your booking page or scheduling tool.',
    pass: 'Online booking / appointment link found.',
  });
  const hasForm = findTags(html, 'form').length > 0 || hrefs.some(x => /^mailto:/i.test(x)) || /contact/i.test(hrefs.join(' '));
  s.add('patient', hasForm ? 1 : 0, 2, {
    severity: 'medium', title: 'No contact form, email link, or contact page link found.',
    impact: 'Patients who prefer not to call have no easy way to reach you.',
    fix: 'Add a simple contact form or a clear "Contact us" link in the menu.',
    pass: 'Contact option found.',
  });
  const years = [...text.matchAll(/(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map(m => Number(m[1]));
  if (years.length) {
    const yr = Math.max(...years);
    s.add('patient', yr >= now.getFullYear() - 1 ? 1 : 0, 1, {
      severity: 'low', title: `Footer copyright says ${yr}.`,
      impact: 'An old year makes the site (and practice) look neglected.',
      fix: 'Update the footer year, or set it to update automatically.',
      pass: 'Copyright year is current.',
    });
  }

  // ---------- Local SEO ----------
  const jsonLd = findElements(html, 'script').filter(e => /ld\+json/i.test(e.attrs.type || '')).map(e => e.inner).join('\n');
  const schemaTypes = [...jsonLd.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)].map(m => m[1]).join(' ')
    + ' ' + findTags(html, '[a-z]+').map(t => t.itemtype || '').join(' ');
  const hasLocalSchema = /Dentist|LocalBusiness|MedicalBusiness|MedicalClinic|Physician|HealthAndBeautyBusiness|Dentistry/i.test(schemaTypes);
  s.add('local', hasLocalSchema ? 1 : 0, 3, {
    severity: 'medium', title: 'No Dentist / LocalBusiness schema found.',
    impact: 'Google has less structured information about your location, hours and phone.',
    fix: 'Add "Dentist" structured data (JSON-LD) with your name, address, phone and opening hours.',
    pass: 'Local business schema present.',
  });
  if (hasLocalSchema) {
    const complete = /"address"|PostalAddress/i.test(jsonLd) && /"telephone"/i.test(jsonLd);
    s.add('local', complete ? 1 : 0, 1, {
      severity: 'low', title: 'Business schema is missing address or phone.',
      impact: 'Google can\'t fully match your site to your Google Business Profile.',
      fix: 'Include "address" and "telephone" in your Dentist schema.',
      pass: 'Schema includes address and phone.',
    });
  }
  const hasAddress = findElements(html, 'address').length > 0
    || /\b\d{1,6}\s+[A-Za-z0-9 .'-]{2,40}\s(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|suite|ste|highway|hwy|parkway|pkwy|place|pl)\b\.?/i.test(text)
    || /\b[A-Z]{2}\s\d{5}(-\d{4})?\b/.test(text) || /\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/.test(text);
  s.add('local', hasAddress ? 1 : 0, 2, {
    severity: 'medium', title: 'No street address visible on the home page.',
    impact: 'Patients (and Google) want to see where you are before they book.',
    fix: 'Show your full address in the header or footer of every page.',
    pass: 'Street address visible.',
  });
  const hasMap = findTags(html, 'iframe').some(f => /google\.[a-z.]+\/maps|maps\.google|openstreetmap|bing\.com\/maps|mapbox/i.test(f.src || f['data-src'] || ''))
    || hrefs.some(x => /google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com/i.test(x));
  s.add('local', hasMap ? 1 : 0, 1, {
    severity: 'low', title: 'No map or directions link.',
    impact: 'New patients have to look up directions themselves.',
    fix: 'Embed a Google Map or add a "Get directions" link to your Google Maps listing.',
    pass: 'Map / directions link present.',
  });

  // ---------- Broken links ----------
  if (linkResults.length) {
    const broken = linkResults.filter(r => !r.ok);
    s.add('links', 1 - broken.length / linkResults.length, 3, {
      severity: broken.length > 2 ? 'medium' : 'low',
      title: `${broken.length} of ${linkResults.length} links checked are broken: ${broken.slice(0, 4).map(b => `${shortUrl(b.href)} (${b.status})`).join(', ')}${broken.length > 4 ? '…' : ''}`,
      impact: 'Broken links frustrate patients and make the site look unmaintained.',
      fix: 'Update or remove those links.',
      pass: `All ${linkResults.length} links checked work.`,
    });
  }

  const result = s.result();
  return {
    url: target.href,
    finalUrl: finalUrl.href,
    host: finalUrl.hostname,
    checkedAt: now.toISOString(),
    durationMs: Date.now() - startedAt,
    title,
    pagespeed: psi,
    stats: { responseMs: ttfb, htmlKb: kb, files: reqCount, images: imgs.length, linksChecked: linkResults.length },
    ...result,
  };
}

function isInsideLabel(html, index) {
  const before = html.slice(Math.max(0, index - 600), index);
  const open = before.lastIndexOf('<label');
  return open !== -1 && before.indexOf('</label', open) === -1;
}

function shortUrl(href) {
  try { const u = new URL(href); return (u.hostname + u.pathname).replace(/\/$/, '').slice(0, 60); } catch { return href.slice(0, 60); }
}

function collectLinks(anchors, base, max) {
  const seen = new Set();
  const internal = [], external = [];
  for (const a of anchors) {
    const raw = (a.href || '').trim();
    if (!raw || /^(#|mailto:|tel:|javascript:|sms:|data:)/i.test(raw)) continue;
    let u;
    try { u = new URL(raw, base); } catch { continue; }
    if (!['http:', 'https:'].includes(u.protocol)) continue;
    u.hash = '';
    if (seen.has(u.href) || u.href === base.href) continue;
    seen.add(u.href);
    (u.hostname === base.hostname ? internal : external).push({ href: u.href, internal: u.hostname === base.hostname });
  }
  const nInternal = Math.min(internal.length, Math.ceil(max * 0.7));
  return internal.slice(0, nInternal).concat(external.slice(0, max - nInternal)).slice(0, max);
}

/** Free snapshot: score + top 3 issues, with the fixes held back for the paid report. */
export function toSnapshot(report) {
  return {
    url: report.url, host: report.host, checkedAt: report.checkedAt,
    score: report.score, grade: report.grade,
    categories: report.categories.map(c => ({ key: c.key, label: c.label, score: c.score })),
    topIssues: report.findings.slice(0, 3).map(f => ({ severity: f.severity, title: f.title, impact: f.impact })),
    totalIssues: report.findings.length,
  };
}

