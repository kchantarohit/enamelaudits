import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { CHECK_BY_ID } from "./catalog";
import { AuditError, checkCertificate, normalizeUrl, pool, probe, safeFetch, type FetchedPage } from "./safe-fetch";
import { scoreChecks } from "./score";
import type { AuditResult, CheckResult, Status } from "./types";

const ENGINE_VERSION = 1;

const BOOKING_VENDORS = [
  "zocdoc", "nexhealth", "localmed", "flexbook", "yapiapp", "yapi.", "getweave", "weave.com", "solutionreach",
  "lighthouse360", "sesamecommunications", "modento", "carestack", "dentrix", "opendental", "open-dental",
  "denticon", "curvedental", "adit.com", "calendly", "acuityscheduling", "setmore", "squareup.com/appointments",
  "simplybook", "bookingbug", "vagaro", "jane.app", "revenuewell", "dentalintel", "patientpop", "doctible",
  "kleer", "smilesnap", "birdeye.com/book", "zenoti", "schedulista", "appointy", "luma", "relatient",
];

const ANALYTICS_MARKERS = [
  "googletagmanager.com", "google-analytics.com", "gtag(", "ga('create'", "plausible.io", "usefathom", "matomo",
  "clarity.ms", "hotjar", "segment.com/analytics", "connect.facebook.net", "fbq(", "analytics.tiktok", "posthog",
  "simpleanalytics", "umami",
];

const REVIEW_MARKERS = ["birdeye", "podium", "elfsight", "trustindex", "reviewsonmywebsite", "embedsocial", "grade.us", "swellcx", "demandforce", "yext"];

function platformOf(html: string, headers: Headers): string | null {
  const h = html.toLowerCase();
  const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] || "";
  if (h.includes("prosites") || h.includes("prositesdental")) return "ProSites";
  if (h.includes("officite")) return "Officite";
  if (h.includes("pbhs")) return "PBHS";
  if (h.includes("televox")) return "TeleVox";
  if (h.includes("wp-content") || /wordpress/i.test(gen)) return "WordPress";
  if (h.includes("static.parastorage.com") || h.includes("wix.com")) return "Wix";
  if (h.includes("squarespace")) return "Squarespace";
  if (h.includes("webflow")) return "Webflow";
  if (h.includes("img1.wsimg.com") || h.includes("godaddy")) return "GoDaddy Website Builder";
  if (h.includes("irp.cdn-website.com") || h.includes("dmcdn")) return "Duda";
  if (h.includes("cdn.shopify")) return "Shopify";
  if (h.includes("hubspot")) return "HubSpot";
  if (h.includes("__next") || headers.get("x-powered-by")?.includes("Next.js")) return "Next.js";
  if (gen) return gen.split(" ")[0];
  return null;
}

function r(id: string, status: Status, detail: string, evidence?: string[], severity?: CheckResult["severity"]): CheckResult {
  if (!CHECK_BY_ID[id]) throw new Error(`Unknown check ${id}`);
  const out: CheckResult = { id, status, detail };
  if (evidence && evidence.length) out.evidence = evidence.slice(0, 15);
  if (severity) out.severity = severity;
  return out;
}

function abs(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return null;
  }
}

function collectSchemaTypes($: cheerio.CheerioAPI): { types: Set<string>; hasAddress: boolean; hasHours: boolean } {
  const types = new Set<string>();
  let hasAddress = false;
  let hasHours = false;
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    if (typeof t === "string") types.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
    if (o.address) hasAddress = true;
    if (o.openingHours || o.openingHoursSpecification) hasHours = true;
    Object.values(o).forEach(visit);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  $("[itemtype]").each((_, el) => {
    const it = $(el).attr("itemtype") || "";
    const m = /schema\.org\/(\w+)/i.exec(it);
    if (m) types.add(m[1]);
  });
  return { types, hasAddress, hasHours };
}

export async function runAudit(rawUrl: string): Promise<AuditResult> {
  const t0 = performance.now();
  const target = normalizeUrl(rawUrl);

  let page: FetchedPage;
  try {
    page = await safeFetch(target, { timeoutMs: 15000 });
  } catch (e) {
    if (e instanceof AuditError) throw e;
    // HTTPS failed entirely; try plain HTTP so we can still report on it.
    if (target.protocol === "https:") {
      const httpUrl = new URL(target.toString());
      httpUrl.protocol = "http:";
      try {
        page = await safeFetch(httpUrl, { timeoutMs: 12000 });
      } catch {
        throw new AuditError(`We couldn't reach ${target.hostname}. Check the address, or try again in a minute.`, "unreachable");
      }
    } else {
      throw new AuditError(`We couldn't reach ${target.hostname}. Check the address, or try again in a minute.`, "unreachable");
    }
  }

  if (page.status >= 400) {
    const blocked = page.status === 403 || page.status === 429 || page.status === 503;
    throw new AuditError(
      blocked
        ? `${target.hostname} blocked our automated check (HTTP ${page.status}). This is usually a firewall setting. Email us and we'll run your audit manually.`
        : `${target.hostname} returned an error (HTTP ${page.status}).`,
      blocked ? "blocked" : "http_error",
    );
  }
  const ctype = page.headers.get("content-type") || "";
  if (!ctype.includes("html") && !/<html/i.test(page.body.slice(0, 2000))) {
    throw new AuditError("That address didn't return a web page.", "not_html");
  }

  const final = new URL(page.finalUrl);
  const origin = final.origin;
  const isHttps = final.protocol === "https:";
  const html = page.body;
  const $ = cheerio.load(html);
  const headers = page.headers;
  const textAll = $("body").text().replace(/\s+/g, " ");
  const htmlLower = html.toLowerCase();
  const checks: CheckResult[] = [];

  // ---------------- parallel network probes
  const robotsP = safeFetch(`${origin}/robots.txt`, { timeoutMs: 6000, maxBytes: 200_000 }).catch(() => null);
  const httpRedirectP = (async () => {
    const u = new URL(final.toString());
    u.protocol = "http:";
    u.port = "";
    try {
      return await safeFetch(u, { method: "GET", timeoutMs: 6000, maxRedirects: 0, maxBytes: 10_000 });
    } catch (e) {
      if (e instanceof AuditError && e.code === "redirect_loop") return "redirects" as const;
      return null;
    }
  })();
  const certP = isHttps ? checkCertificate(final.hostname) : Promise.resolve(null);

  // Links
  const anchors = $("a[href]").toArray();
  const internal = new Set<string>();
  const external = new Set<string>();
  for (const a of anchors) {
    const href = $(a).attr("href") || "";
    if (/^(mailto:|tel:|sms:|javascript:|#)/i.test(href.trim())) continue;
    const u = abs(href, page.finalUrl);
    if (!u || !/^https?:/i.test(u)) continue;
    const clean = u.split("#")[0];
    if (new URL(clean).hostname.replace(/^www\./, "") === final.hostname.replace(/^www\./, "")) internal.add(clean);
    else external.add(clean);
  }
  internal.delete(page.finalUrl.split("#")[0]);
  const linkTargets = [...internal].slice(0, 25).concat([...external].slice(0, 10));
  const linksP = pool(linkTargets, 8, async (u) => ({ url: u, internal: internal.has(u), ...(await probe(u, 6000)) }));

  // Images
  const imgs = $("img").toArray();
  const imgUrls = [
    ...new Set(
      imgs
        .map((el) => abs($(el).attr("src") || $(el).attr("data-src") || undefined, page.finalUrl))
        .filter((u): u is string => !!u && /^https?:/i.test(u) && !/\.svg(\?|$)/i.test(u)),
    ),
  ].slice(0, 12);
  const imagesP = pool(imgUrls, 6, async (u) => ({ url: u, ...(await probe(u, 6000)) }));

  // ---------------- SPEED
  const ttfb = page.ttfbMs;
  checks.push(
    ttfb < 800
      ? r("server_response", "pass", `Your server responded in ${ttfb} ms.`)
      : ttfb < 1800
        ? r("server_response", "warn", `Your server took ${ttfb} ms to respond. Under 800 ms is the goal.`)
        : r("server_response", "fail", `Your server took ${(ttfb / 1000).toFixed(1)} seconds to respond. Under 0.8 seconds is the goal.`),
  );

  const enc = (headers.get("content-encoding") || "").toLowerCase();
  if (/(br|gzip|zstd|deflate)/.test(enc)) checks.push(r("compression", "pass", `Pages are compressed (${enc}).`));
  else if (page.bytes < 15_000) checks.push(r("compression", "pass", "Page is small enough that compression makes little difference."));
  else checks.push(r("compression", "fail", `Your ${Math.round(page.bytes / 1024)} KB page is sent uncompressed.`));

  const kb = Math.round(page.bytes / 1024);
  checks.push(
    kb <= 200
      ? r("html_size", "pass", `Home page code is ${kb} KB.`)
      : kb <= 500
        ? r("html_size", "warn", `Home page code is ${kb} KB (aim for under 200 KB).`)
        : r("html_size", "fail", `Home page code is ${kb} KB, which is very heavy (aim for under 200 KB).`),
  );

  const blocking = $("head script[src]")
    .toArray()
    .filter((el) => {
      const s = $(el);
      return s.attr("async") === undefined && s.attr("defer") === undefined && (s.attr("type") || "").toLowerCase() !== "module";
    })
    .map((el) => $(el).attr("src") || "");
  checks.push(
    blocking.length <= 2
      ? r("render_blocking", "pass", blocking.length ? `${blocking.length} render-blocking script(s), which is acceptable.` : "No render-blocking scripts in the page head.")
      : blocking.length <= 6
        ? r("render_blocking", "warn", `${blocking.length} scripts in the page head block the page from appearing.`, blocking)
        : r("render_blocking", "fail", `${blocking.length} scripts in the page head block the page from appearing.`, blocking),
  );

  const requestCount =
    $("script[src]").length + $('link[rel="stylesheet"]').length + imgs.length + $("iframe[src]").length + $("video source[src], video[src]").length;
  checks.push(
    requestCount <= 50
      ? r("page_requests", "pass", `About ${requestCount} files referenced by the home page.`)
      : requestCount <= 90
        ? r("page_requests", "warn", `About ${requestCount} files referenced by the home page (aim for under 50).`)
        : r("page_requests", "fail", `About ${requestCount} files referenced by the home page (aim for under 50).`),
  );

  const lazyCount = imgs.filter((el) => ($(el).attr("loading") || "").toLowerCase() === "lazy" || $(el).attr("data-src") || $(el).attr("data-lazy-src")).length;
  if (imgs.length <= 6) checks.push(r("lazy_images", "pass", `Only ${imgs.length} images on the page.`));
  else if (lazyCount > 0) checks.push(r("lazy_images", "pass", `${lazyCount} of ${imgs.length} images use lazy loading.`));
  else checks.push(r("lazy_images", "warn", `None of the ${imgs.length} images use lazy loading.`));

  // ---------------- SECURITY
  checks.push(
    isHttps
      ? r("https", "pass", "Your site loads over HTTPS.")
      : r("https", "fail", "Your site loads over plain http://, so browsers label it 'Not secure'."),
  );

  const httpRes = await httpRedirectP;
  if (!isHttps) checks.push(r("http_redirect", "fail", "The site doesn't redirect visitors to a secure https:// address."));
  else if (httpRes === "redirects") checks.push(r("http_redirect", "pass", "http:// redirects to https://."));
  else if (httpRes && httpRes.status >= 300 && httpRes.status < 400) checks.push(r("http_redirect", "pass", "http:// redirects to https://."));
  else if (httpRes && httpRes.redirects.some(Boolean)) checks.push(r("http_redirect", "pass", "http:// redirects to https://."));
  else if (httpRes && httpRes.status < 300) checks.push(r("http_redirect", "fail", "The http:// version of your site loads without redirecting to https://."));
  else checks.push(r("http_redirect", "warn", "The http:// version of your site didn't respond, so visitors typing it may see an error.", undefined, "low"));

  const cert = await certP;
  if (!isHttps) checks.push(r("ssl_certificate", "fail", "No SSL certificate in use."));
  else if (!cert) checks.push(r("ssl_certificate", "info", "Certificate details couldn't be read, but the HTTPS connection worked."));
  else if (!cert.authorized) checks.push(r("ssl_certificate", "fail", `The certificate isn't trusted by browsers (${cert.error || "invalid"}).`));
  else if ((cert.daysLeft ?? 99) < 0) checks.push(r("ssl_certificate", "fail", `The certificate expired on ${cert.validTo}.`));
  else if ((cert.daysLeft ?? 99) < 21) checks.push(r("ssl_certificate", "warn", `The certificate expires in ${cert.daysLeft} days (${cert.validTo}). Make sure it renews.`));
  else checks.push(r("ssl_certificate", "pass", `Valid certificate${cert.issuer ? ` from ${cert.issuer}` : ""}, expires in ${cert.daysLeft} days.`));

  checks.push(headers.get("strict-transport-security") ? r("hsts", "pass", "HSTS header is set.") : r("hsts", "fail", "No Strict-Transport-Security header."));
  checks.push(
    (headers.get("x-content-type-options") || "").toLowerCase().includes("nosniff")
      ? r("nosniff", "pass", "X-Content-Type-Options: nosniff is set.")
      : r("nosniff", "fail", "No X-Content-Type-Options header."),
  );
  const csp = headers.get("content-security-policy") || "";
  checks.push(
    headers.get("x-frame-options") || /frame-ancestors/i.test(csp)
      ? r("clickjacking", "pass", "Framing protection is set.")
      : r("clickjacking", "fail", "No X-Frame-Options or frame-ancestors policy."),
  );

  if (isHttps) {
    const mixed = $("img[src], script[src], iframe[src], source[src], video[src], audio[src], link[rel='stylesheet'][href]")
      .toArray()
      .map((el) => $(el).attr("src") || $(el).attr("href") || "")
      .filter((s) => /^http:\/\//i.test(s));
    checks.push(
      mixed.length
        ? r("mixed_content", "fail", `${mixed.length} file(s) load over insecure http://.`, mixed)
        : r("mixed_content", "pass", "No insecure http:// files found on the page."),
    );
  } else {
    checks.push(r("mixed_content", "info", "Not applicable until the site uses HTTPS."));
  }

  const generator = $('meta[name="generator"]').attr("content") || "";
  const poweredBy = headers.get("x-powered-by") || "";
  const serverHeader = headers.get("server") || "";
  const versionLeaks = [
    /\d+\.\d+/.test(generator) ? `Generator tag: ${generator}` : "",
    /\d+\.\d+/.test(poweredBy) ? `X-Powered-By: ${poweredBy}` : "",
    /\d+\.\d+/.test(serverHeader) ? `Server: ${serverHeader}` : "",
  ].filter(Boolean);
  checks.push(
    versionLeaks.length
      ? r("version_exposed", "fail", "Software versions are visible to anyone.", versionLeaks)
      : r("version_exposed", "pass", "No software version numbers exposed."),
  );

  // ---------------- SEO
  const title = $("head title").first().text().trim();
  if (!title) checks.push(r("title", "fail", "The home page has no title."));
  else if (title.length < 10 || title.length > 65)
    checks.push(r("title", "warn", `Title is ${title.length} characters: "${title}". Aim for roughly 30–60.`, undefined, "low"));
  else checks.push(r("title", "pass", `"${title}" (${title.length} characters).`));

  const desc = ($('meta[name="description"]').attr("content") || "").trim();
  if (!desc) checks.push(r("meta_description", "fail", "No meta description found."));
  else if (desc.length < 50 || desc.length > 160)
    checks.push(r("meta_description", "warn", `Description is ${desc.length} characters (aim for 120–155): "${desc.slice(0, 170)}"`, undefined, "low"));
  else checks.push(r("meta_description", "pass", `"${desc}"`));

  const h1s = $("h1").toArray().map((el) => $(el).text().replace(/\s+/g, " ").trim()).filter(Boolean);
  if (h1s.length === 0) checks.push(r("h1", "fail", "No H1 heading on the home page."));
  else if (h1s.length > 1) checks.push(r("h1", "warn", `${h1s.length} H1 headings found; use exactly one.`, h1s, "low"));
  else checks.push(r("h1", "pass", `"${h1s[0].slice(0, 120)}"`));

  const robotsMeta = ($('meta[name="robots"]').attr("content") || "") + " " + ($('meta[name="googlebot"]').attr("content") || "");
  const xRobots = headers.get("x-robots-tag") || "";
  checks.push(
    /noindex/i.test(robotsMeta) || /noindex/i.test(xRobots)
      ? r("noindex", "fail", "The page carries a 'noindex' instruction, telling Google not to list it.", [robotsMeta.trim(), xRobots].filter(Boolean))
      : r("noindex", "pass", "Google is allowed to list this page."),
  );

  checks.push($('link[rel="canonical"]').attr("href") ? r("canonical", "pass", `Canonical: ${$('link[rel="canonical"]').attr("href")}`) : r("canonical", "warn", "No canonical tag."));

  const robots = await robotsP;
  let sitemapFromRobots: string[] = [];
  if (robots && robots.status === 200 && !/<html/i.test(robots.body.slice(0, 500))) {
    const lines = robots.body.split(/\r?\n/).map((l) => l.trim());
    sitemapFromRobots = lines.filter((l) => /^sitemap:/i.test(l)).map((l) => l.replace(/^sitemap:\s*/i, ""));
    let inStar = false;
    let blocksAll = false;
    for (const l of lines) {
      if (/^user-agent:/i.test(l)) inStar = /^user-agent:\s*\*\s*$/i.test(l);
      else if (inStar && /^disallow:\s*\/\s*$/i.test(l)) blocksAll = true;
    }
    checks.push(
      blocksAll
        ? r("robots_txt", "fail", "robots.txt blocks all search engines ('Disallow: /').", undefined, "high")
        : r("robots_txt", "pass", "robots.txt exists and allows crawling."),
    );
  } else {
    checks.push(r("robots_txt", "warn", "No robots.txt file found.", undefined, "low"));
  }

  let sitemapOk = false;
  const sitemapCandidates = [...sitemapFromRobots.slice(0, 2), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  for (const sm of sitemapCandidates) {
    const res = await safeFetch(sm, { timeoutMs: 5000, maxBytes: 40_000 }).catch(() => null);
    if (res && res.status === 200 && /<(urlset|sitemapindex)/i.test(res.body)) {
      sitemapOk = true;
      checks.push(r("sitemap", "pass", `Sitemap found: ${res.finalUrl}`));
      break;
    }
  }
  if (!sitemapOk) checks.push(r("sitemap", "fail", "No XML sitemap found at the usual locations or in robots.txt."));

  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  checks.push(
    ogTitle && ogImage
      ? r("open_graph", "pass", "Share title and image are set.")
      : ogTitle || ogImage
        ? r("open_graph", "warn", `Only ${ogTitle ? "og:title" : "og:image"} is set.`)
        : r("open_graph", "fail", "No Open Graph tags."),
  );

  if ($('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length) checks.push(r("favicon", "pass", "Favicon is set."));
  else {
    const fav = await probe(`${origin}/favicon.ico`, 4000);
    checks.push(fav.status === 200 ? r("favicon", "pass", "favicon.ico found.") : r("favicon", "fail", "No favicon found."));
  }

  // ---------------- MOBILE
  const viewport = $('meta[name="viewport"]').attr("content") || "";
  checks.push(
    /width\s*=\s*device-width/i.test(viewport)
      ? r("viewport", "pass", `Viewport: ${viewport}`)
      : viewport
        ? r("viewport", "warn", `Viewport is set but not to device width: ${viewport}`)
        : r("viewport", "fail", "No mobile viewport tag, so phones will show a shrunken desktop page."),
  );
  const zoomBlocked = /user-scalable\s*=\s*(no|0)/i.test(viewport) || /maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport);
  checks.push(zoomBlocked ? r("zoom_enabled", "fail", `Zoom is blocked: ${viewport}`) : r("zoom_enabled", "pass", "Patients can pinch to zoom."));

  // ---------------- ACCESSIBILITY
  const contentImgs = imgs.filter((el) => {
    const w = $(el).attr("width");
    const h = $(el).attr("height");
    return !(w === "1" || h === "1");
  });
  const noAlt = contentImgs.filter((el) => $(el).attr("alt") === undefined);
  if (!contentImgs.length) checks.push(r("img_alt", "pass", "No images to check."));
  else {
    const pct = Math.round((100 * (contentImgs.length - noAlt.length)) / contentImgs.length);
    const ev = noAlt.map((el) => $(el).attr("src") || $(el).attr("data-src") || "(inline image)").slice(0, 10);
    checks.push(
      pct >= 95
        ? r("img_alt", "pass", `${pct}% of images have alt text.`)
        : pct >= 70
          ? r("img_alt", "warn", `${noAlt.length} of ${contentImgs.length} images have no alt text.`, ev)
          : r("img_alt", "fail", `${noAlt.length} of ${contentImgs.length} images have no alt text.`, ev),
    );
  }

  const fields = $("input, select, textarea")
    .toArray()
    .filter((el) => !/^(hidden|submit|button|image|reset)$/i.test($(el).attr("type") || ""));
  const isLabelled = (el: AnyNode) => {
    const f = $(el);
    const id = f.attr("id");
    return (
      !!f.attr("aria-label") || !!f.attr("aria-labelledby") || !!f.attr("title") ||
      (id && $(`label[for="${id.replace(/"/g, "")}"]`).length > 0) || f.closest("label").length > 0
    );
  };
  const unlabelled = fields.filter((el) => !isLabelled(el));
  checks.push(
    !fields.length
      ? r("form_labels", "pass", "No form fields on the home page.")
      : unlabelled.length
        ? r("form_labels", "fail", `${unlabelled.length} of ${fields.length} form fields have no label.`, unlabelled.map((el) => $(el).attr("name") || $(el).attr("placeholder") || $(el).attr("type") || "field"))
        : r("form_labels", "pass", `All ${fields.length} form fields are labelled.`),
  );

  checks.push($("html").attr("lang") ? r("html_lang", "pass", `Language: ${$("html").attr("lang")}`) : r("html_lang", "fail", "No lang attribute on the page."));

  const emptyLinks = anchors.filter((a) => {
    const el = $(a);
    if (el.text().trim()) return false;
    if (el.attr("aria-label") || el.attr("title") || el.attr("aria-labelledby")) return false;
    if (el.find("img[alt]").toArray().some((i) => ($(i).attr("alt") || "").trim())) return false;
    if (el.find("[aria-label], title").length) return false;
    return true;
  });
  const emptyEv = emptyLinks.map((a) => $(a).attr("href") || "").slice(0, 10);
  checks.push(
    emptyLinks.length === 0
      ? r("link_names", "pass", "All links have readable text.")
      : emptyLinks.length <= 3
        ? r("link_names", "warn", `${emptyLinks.length} link(s) have no readable text.`, emptyEv)
        : r("link_names", "fail", `${emptyLinks.length} links have no readable text.`, emptyEv),
  );

  // ---------------- PATIENT ACTIONS
  const telLinks = $('a[href^="tel:"]').toArray();
  const phoneText = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.exec(textAll)?.[0];
  if (telLinks.length) checks.push(r("tel_link", "pass", `Tap-to-call link found (${$(telLinks[0]).attr("href")}).`));
  else if (phoneText) checks.push(r("tel_link", "fail", `Your number ${phoneText} is shown but isn't tappable on phones.`));
  else checks.push(r("tel_link", "fail", "No phone number or tap-to-call link found on the home page."));

  const linkBlobs = anchors.map((a) => `${$(a).attr("href") || ""} ${$(a).text()}`.toLowerCase());
  const iframeSrcs = $("iframe[src], script[src]").toArray().map((el) => ($(el).attr("src") || "").toLowerCase());
  const vendor = BOOKING_VENDORS.find((v) => linkBlobs.some((b) => b.includes(v)) || iframeSrcs.some((s) => s.includes(v)) || htmlLower.includes(v + "/"));
  const bookingText = anchors.find((a) => {
    const t = `${$(a).text()} ${$(a).attr("aria-label") || ""}`.toLowerCase();
    const href = ($(a).attr("href") || "").toLowerCase();
    if (href.startsWith("tel:") || /facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com/.test(href)) return false;
    return (
      /\b(book|schedul|appointment|request (an )?appt|request a visit|reserve)/.test(t) ||
      /(^|[/\-_?=#.])(book|booking|book-now|schedule|scheduling|appointments?|request-appointment)([/\-_?=#.]|$)/.test(href)
    );
  });
  const bookingButton = $("button")
    .toArray()
    .find((b) => /\b(book|schedul|appointment)/i.test($(b).text()));
  if (vendor) checks.push(r("online_booking", "pass", `Online booking found (${vendor.replace(/[./]+$/, "")}).`));
  else if (bookingText || bookingButton)
    checks.push(r("online_booking", "pass", `Appointment link found: "${$(bookingText || bookingButton!).text().trim().slice(0, 60)}".`));
  else checks.push(r("online_booking", "fail", "No booking button, scheduling link, or appointment-request form found on the home page."));

  const hasForm = $("form").toArray().some((f) => $(f).find('input[type="email"], textarea, input[type="tel"]').length > 0);
  const contactLink = linkBlobs.some((b) => /contact/.test(b));
  checks.push(
    hasForm || contactLink
      ? r("contact_form", "pass", hasForm ? "Contact form found on the home page." : "Contact page linked.")
      : r("contact_form", "warn", "No contact form or contact page link found."),
  );

  const newPatient = /new[\s-]patient/i.test(textAll) || linkBlobs.some((b) => /new[\s-]?patient/.test(b));
  checks.push(newPatient ? r("new_patients", "pass", "New patient information is linked.") : r("new_patients", "warn", "No 'New Patients' link or section found."));

  const insurance = /(insurance|financing|carecredit|payment (options|plans)|in[\s-]network|ppo|membership plan|sunbit|cherry)/i.exec(textAll);
  checks.push(insurance ? r("insurance_info", "pass", `Mentions "${insurance[0]}".`) : r("insurance_info", "warn", "No insurance, financing or payment information found."));

  const reviews = /(review|testimonial|★|5[\s-]star|patients say|what our patients)/i.test(textAll) || REVIEW_MARKERS.some((m) => htmlLower.includes(m));
  checks.push(reviews ? r("reviews", "pass", "Reviews or testimonials found.") : r("reviews", "warn", "No reviews or testimonials found on the home page."));

  const thisYear = new Date().getUTCFullYear();
  const footerText = ($("footer").text() || textAll.slice(-3000)).replace(/\s+/g, " ");
  const yearMatches = [...footerText.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  const maxYear = yearMatches.length ? Math.max(...yearMatches) : null;
  if (maxYear === null) checks.push(r("copyright_year", "info", "No copyright year found in the footer."));
  else if (maxYear >= thisYear - 1) checks.push(r("copyright_year", "pass", `Footer shows ${maxYear}.`));
  else checks.push(r("copyright_year", "warn", `Footer still says ${maxYear}.`));

  const analytics = ANALYTICS_MARKERS.find((m) => htmlLower.includes(m));
  checks.push(
    analytics
      ? r("analytics", "pass", `Analytics found (${analytics.replace(/[.(']+$/, "")}).`)
      : r("analytics", "warn", "No analytics or tag manager found in the page code. If you're not measuring visits, calls and bookings, set this up."),
  );

  const privacy = linkBlobs.some((b) => /privacy/.test(b));
  checks.push(privacy ? r("privacy_policy", "pass", "Privacy policy is linked.") : r("privacy_policy", "fail", "No privacy policy link found."));

  // ---------------- LOCAL
  const schema = collectSchemaTypes($);
  const types = [...schema.types];
  const dentistType = types.find((t) => /^(Dentist|Orthodontist|DentalClinic)$/i.test(t));
  const localType = types.find((t) => /(LocalBusiness|Medical|Physician|Clinic|Organization|Hospital)/i.test(t));
  checks.push(
    dentistType
      ? r("local_schema", "pass", `Structured data found: ${dentistType}.`)
      : localType
        ? r("local_schema", "warn", `Generic structured data found (${localType}); the more specific "Dentist" type is better.`, types)
        : r("local_schema", "fail", "No Dentist or LocalBusiness structured data found."),
  );

  const addressRe =
    /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pkwy|parkway|hwy|highway|ct|court|pl|place|cir|circle|ter|terrace|trl|trail|sq|square|pike)\b\.?/i;
  const zipRe = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;
  const postcodeRe = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/;
  const addr = addressRe.exec(textAll)?.[0] || zipRe.exec(textAll)?.[0] || postcodeRe.exec(textAll)?.[0] || $("address").first().text().trim();
  checks.push(
    addr || schema.hasAddress
      ? r("address_visible", "pass", addr ? `Address found: "${addr.slice(0, 80)}".` : "Address is in your structured data.")
      : r("address_visible", "fail", "No street address found in the page text."),
  );

  const mapFound =
    $("iframe[src*='google.com/maps'], iframe[src*='maps.google'], iframe[data-src*='google.com/maps'], iframe[src*='mapbox']").length > 0 ||
    linkBlobs.some((b) => /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|directions)/.test(b));
  checks.push(mapFound ? r("map", "pass", "Map or directions link found.") : r("map", "warn", "No map or directions link found."));

  const hoursRe = /\b(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?)\b[^.]{0,40}?\b\d{1,2}(:\d{2})?\s?(a\.?m|p\.?m)/i;
  const hours = schema.hasHours || hoursRe.test(textAll) || /\b(office )?hours\b/i.test(textAll);
  checks.push(hours ? r("hours", "pass", "Opening hours are shown.") : r("hours", "warn", "No opening hours found on the home page."));

  // ---------------- LINKS
  const [links, images] = await Promise.all([linksP, imagesP]);
  const broken = links.filter((l) => {
    if (l.internal) return l.status >= 400 || l.status === 0;
    return l.status === 404 || l.status === 410 || (l.status >= 500 && l.status < 600);
  });
  const brokenInternal = broken.filter((l) => l.internal);
  const ev = broken.map((l) => `${l.status || "no response"}: ${l.url}`);
  if (!links.length) checks.push(r("broken_links", "pass", "No links to check."));
  else if (brokenInternal.length) checks.push(r("broken_links", "fail", `${broken.length} of ${links.length} links checked are broken.`, ev));
  else if (broken.length) checks.push(r("broken_links", "warn", `${broken.length} external link(s) are broken.`, ev, "low"));
  else checks.push(r("broken_links", "pass", `All ${links.length} links checked work.`));

  const heavy = images.filter((i) => i.bytes > 400_000).sort((a, b) => b.bytes - a.bytes);
  const measured = images.filter((i) => i.bytes > 0);
  const heavyEv = heavy.map((i) => `${Math.round(i.bytes / 1024)} KB: ${i.url}`);
  if (!measured.length) checks.push(r("image_weight", "info", imgs.length ? "Image sizes couldn't be measured." : "No images on the page."));
  else if (!heavy.length) checks.push(r("image_weight", "pass", `All ${measured.length} images measured are under 400 KB.`));
  else if (heavy.length <= 2) checks.push(r("image_weight", "warn", `${heavy.length} image(s) are over 400 KB.`, heavyEv));
  else checks.push(r("image_weight", "fail", `${heavy.length} images are over 400 KB.`, heavyEv));

  const { categoryScores, score, grade } = scoreChecks(checks);
  return {
    meta: {
      inputUrl: rawUrl,
      finalUrl: page.finalUrl,
      domain: final.hostname.replace(/^www\./, ""),
      statusCode: page.status,
      ttfbMs: page.ttfbMs,
      totalMs: page.totalMs,
      htmlBytes: page.bytes,
      pageTitle: title || null,
      platform: platformOf(html, headers),
      redirects: page.redirects,
      durationMs: Math.round(performance.now() - t0),
      auditedAt: new Date().toISOString(),
      version: ENGINE_VERSION,
    },
    checks,
    categoryScores,
    score,
    grade,
  };
}
