#!/usr/bin/env python3
"""Enamel Audits report generator.

Runs the public-page checks advertised on the landing page and writes a
plain-English HTML report (print-to-PDF ready).

Usage:
  python3 enamel_audit.py https://practice.com                 # full report
  python3 enamel_audit.py https://practice.com --snapshot      # free snapshot (score + top 3)
  python3 enamel_audit.py https://practice.com --name "Smile Dental" --out reports/
  python3 enamel_audit.py --batch prospects.txt --snapshot     # one URL per line
  python3 enamel_audit.py https://practice.com --json          # machine-readable, for monitoring diffs

Standard library only. Makes a small number of polite, spaced-out requests.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from html.parser import HTMLParser
from pathlib import Path

UA = "EnamelAuditsBot/1.0 (website health check; public pages only)"
TIMEOUT = 15
POLITE_DELAY = 0.6
MAX_LINKS = 25

SEVERITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}
CATEGORIES = ["Speed", "Security", "SEO basics", "Mobile", "Accessibility",
              "Patient actions", "Local SEO", "Broken links"]
BOOKING_HINTS = ("book", "appointment", "schedule", "request-appointment", "zocdoc",
                 "localmed", "nexhealth", "flexbook", "opencare", "solutionreach",
                 "lighthouse360", "dentrix", "modento", "weave")


# ---------------------------------------------------------------- fetching
@dataclass
class Resp:
    url: str
    status: int
    headers: dict
    body: bytes
    elapsed: float
    error: str = ""


def fetch(url: str, method: str = "GET", max_bytes: int = 5_000_000) -> Resp:
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA,
                                 "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"})
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(max_bytes) if method == "GET" else b""
            return Resp(r.geturl(), r.status, {k.lower(): v for k, v in r.headers.items()},
                        body, time.monotonic() - t0)
    except urllib.error.HTTPError as e:
        return Resp(url, e.code, {k.lower(): v for k, v in (e.headers or {}).items()},
                    b"", time.monotonic() - t0, str(e))
    except Exception as e:  # network, DNS, TLS
        return Resp(url, 0, {}, b"", time.monotonic() - t0, str(e))


def cert_days_left(host: str) -> int | None:
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=TIMEOUT) as s:
            with ctx.wrap_socket(s, server_hostname=host) as ss:
                exp = ss.getpeercert()["notAfter"]
        exp_dt = dt.datetime.strptime(exp, "%b %d %H:%M:%S %Y %Z")
        return (exp_dt - dt.datetime.utcnow()).days
    except Exception:
        return None


# ---------------------------------------------------------------- parsing
class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._in_h1 = False
        self._in_script_ld = False
        self._in_label = False
        self.meta = {}
        self.links: list[str] = []
        self.link_texts: list[tuple[str, str]] = []
        self._cur_a: str | None = None
        self._cur_a_text = ""
        self.canonical = None
        self.h1s: list[str] = []
        self.imgs: list[dict] = []
        self.inputs: list[dict] = []
        self.label_for: set[str] = set()
        self.label_wrapped = 0
        self.forms = 0
        self.iframes: list[str] = []
        self.ld_json: list[str] = []
        self.text_parts: list[str] = []
        self.itemtypes: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if "itemtype" in a:
            self.itemtypes.append(a["itemtype"])
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if key:
                self.meta[key] = a.get("content", "")
        elif tag == "link" and "canonical" in a.get("rel", "").lower():
            self.canonical = a.get("href")
        elif tag == "a":
            self._cur_a = a.get("href", "")
            self._cur_a_text = ""
            if self._cur_a:
                self.links.append(self._cur_a)
        elif tag == "h1":
            self._in_h1 = True
            self.h1s.append("")
        elif tag == "img":
            self.imgs.append(a)
        elif tag in ("input", "select", "textarea"):
            if a.get("type", "").lower() not in ("hidden", "submit", "button", "image", "reset"):
                a["_wrapped"] = self._in_label
                self.inputs.append(a)
        elif tag == "label":
            self._in_label = True
            if a.get("for"):
                self.label_for.add(a["for"])
        elif tag == "form":
            self.forms += 1
        elif tag == "iframe":
            self.iframes.append(a.get("src", "") or a.get("data-src", ""))
        elif tag == "script" and "ld+json" in a.get("type", "").lower():
            self._in_script_ld = True
            self.ld_json.append("")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._in_h1 = False
        elif tag == "label":
            self._in_label = False
        elif tag == "script":
            self._in_script_ld = False
        elif tag == "a" and self._cur_a is not None:
            self.link_texts.append((self._cur_a, self._cur_a_text.strip()))
            self._cur_a = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_h1 and self.h1s:
            self.h1s[-1] += data
        if self._in_script_ld and self.ld_json:
            self.ld_json[-1] += data
        if self._cur_a is not None:
            self._cur_a_text += data
        if not self._in_script_ld:
            self.text_parts.append(data)

    @property
    def text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.text_parts))


# ---------------------------------------------------------------- findings
@dataclass
class Finding:
    category: str
    severity: str           # high / medium / low
    title: str
    why: str
    fix: str


@dataclass
class Report:
    url: str
    name: str
    date: str
    findings: list[Finding] = field(default_factory=list)
    passed: list[tuple[str, str]] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    fatal: str = ""

    def add(self, cat, sev, title, why, fix):
        self.findings.append(Finding(cat, sev, title, why, fix))

    def ok(self, cat, title):
        self.passed.append((cat, title))

    def category_scores(self) -> dict[str, int]:
        scores = {}
        for c in CATEGORIES:
            # high -36, medium -24, low -12 per issue, floored at 0
            penalty = sum(SEVERITY_WEIGHT[f.severity] * 12 for f in self.findings if f.category == c)
            scores[c] = max(0, 100 - penalty)
        return scores

    def overall(self) -> int:
        s = self.category_scores()
        weights = {"Speed": 1.2, "Security": 1.2, "SEO basics": 1.0, "Mobile": 1.0,
                   "Accessibility": 0.8, "Patient actions": 1.3, "Local SEO": 1.0,
                   "Broken links": 0.7}
        return round(sum(s[c] * weights[c] for c in CATEGORIES) / sum(weights.values()))

    def sorted_findings(self) -> list[Finding]:
        order = {c: i for i, c in enumerate(["Patient actions", "Security", "Speed", "Mobile",
                                             "Local SEO", "SEO basics", "Broken links",
                                             "Accessibility"])}
        return sorted(self.findings, key=lambda f: (-SEVERITY_WEIGHT[f.severity], order[f.category]))


def grade(score: int) -> str:
    return "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"


# ---------------------------------------------------------------- checks
def normalize(url: str) -> str:
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    return url


def audit(url: str, name: str = "") -> Report:
    url = normalize(url)
    host = urllib.parse.urlparse(url).hostname or ""
    rep = Report(url=url, name=name or host, date=dt.date.today().isoformat())

    home = fetch(url)
    if home.status == 0 and url.startswith("https://"):
        alt = fetch("http://" + url[len("https://"):])
        if alt.status:
            home = alt
    if home.status == 0 or home.status >= 400 or not home.body:
        rep.fatal = f"The home page could not be loaded ({home.error or 'HTTP ' + str(home.status)})."
        rep.add("Speed", "high", "Home page did not load",
                "Patients who click your link may see an error page instead of your practice.",
                "Ask your web host to check the site is online and reachable.")
        return rep

    final = home.url
    final_host = urllib.parse.urlparse(final).hostname or host
    page = PageParser()
    page.feed(home.body.decode("utf-8", errors="replace"))
    text = page.text
    lower_html = home.body.decode("utf-8", errors="replace").lower()

    # --- Speed
    rep.metrics["response_seconds"] = round(home.elapsed, 2)
    rep.metrics["html_kb"] = round(len(home.body) / 1024)
    if home.elapsed > 3:
        rep.add("Speed", "high", f"Slow server response ({home.elapsed:.1f}s)",
                "On a phone, people often give up and go back to the search results before the page appears.",
                "Ask your host about caching or a faster hosting plan. A response under 1 second is a good target.")
    elif home.elapsed > 1.5:
        rep.add("Speed", "medium", f"Server response could be faster ({home.elapsed:.1f}s)",
                "Every extra second before the page starts loading costs some visitors.",
                "Enable page caching (most WordPress hosts offer it) or a CDN such as Cloudflare.")
    else:
        rep.ok("Speed", f"Fast server response ({home.elapsed:.1f}s)")
    if len(home.body) > 500_000:
        rep.add("Speed", "medium", f"Heavy home page HTML ({len(home.body)//1024} KB)",
                "Large pages load slowly on mobile data.",
                "Remove unused page-builder sections and inline code; move large scripts to separate files.")
    else:
        rep.ok("Speed", "Home page HTML size is reasonable")
    big_imgs = [i for i in page.imgs if re.search(r"\.(png|bmp|tiff?)(\?|$)", i.get("src", ""), re.I)]
    if len(big_imgs) >= 4:
        rep.add("Speed", "low", f"{len(big_imgs)} images use heavy formats (PNG/BMP)",
                "Photos saved as PNG are often several times larger than needed.",
                "Convert photos to WebP or compressed JPG.")

    # --- Security
    if final.startswith("https://"):
        rep.ok("Security", "Site loads over HTTPS")
    else:
        rep.add("Security", "high", "Site does not use HTTPS",
                "Browsers show a 'Not secure' warning, which makes patients hesitant to fill in forms.",
                "Install a free SSL certificate (Let's Encrypt) and redirect all pages to https://.")
    time.sleep(POLITE_DELAY)
    http_try = fetch("http://" + final_host + "/", method="GET", max_bytes=1)
    if http_try.status and not http_try.url.startswith("https://") and final.startswith("https://"):
        rep.add("Security", "medium", "http:// version does not redirect to https://",
                "Visitors using old links land on the insecure version of your site.",
                "Add a permanent (301) redirect from http:// to https://.")
    elif final.startswith("https://"):
        rep.ok("Security", "http:// redirects to https://")
    days = cert_days_left(final_host) if final.startswith("https://") else None
    rep.metrics["ssl_days_left"] = days
    if days is not None:
        if days < 14:
            rep.add("Security", "high", f"SSL certificate expires in {days} days",
                    "When it expires, browsers block visitors with a full-page security warning.",
                    "Renew the certificate now and turn on auto-renewal.")
        else:
            rep.ok("Security", f"SSL certificate valid ({days} days left)")
    h = home.headers
    missing = [n for n, k in [("HSTS", "strict-transport-security"),
                              ("X-Content-Type-Options", "x-content-type-options")] if k not in h]
    if "x-frame-options" not in h and "frame-ancestors" not in h.get("content-security-policy", ""):
        missing.append("X-Frame-Options")
    if missing:
        rep.add("Security", "low", "Missing security headers: " + ", ".join(missing),
                "These headers help protect visitors against some common browser-based attacks.",
                "Your host or a plugin (or Cloudflare) can add them in a few minutes.")
    else:
        rep.ok("Security", "Key security headers present")

    # --- SEO basics
    title = page.title.strip()
    if not title:
        rep.add("SEO basics", "high", "Home page has no title",
                "Google shows the title as the headline of your search listing.",
                "Add a title like 'Family Dentist in [City] | [Practice Name]'.")
    elif len(title) < 15 or len(title) > 65:
        rep.add("SEO basics", "low", f"Page title length is not ideal ({len(title)} characters)",
                "Very short titles miss keywords; long ones get cut off in Google.",
                "Aim for 30 to 60 characters including your city and service.")
    else:
        rep.ok("SEO basics", "Page title present")
    desc = page.meta.get("description", "").strip()
    if not desc:
        rep.add("SEO basics", "medium", "No meta description on the home page",
                "Google picks random text from your page for your search listing.",
                "Add a 1 to 2 sentence description of your practice, location and what makes you different.")
    else:
        rep.ok("SEO basics", "Meta description present")
    h1s = [x.strip() for x in page.h1s if x.strip()]
    if not h1s:
        rep.add("SEO basics", "medium", "No main (H1) heading",
                "Search engines use the main heading to understand what the page is about.",
                "Make your main headline an H1, e.g. 'Gentle Family Dentistry in [City]'.")
    elif len(h1s) > 1:
        rep.add("SEO basics", "low", f"{len(h1s)} H1 headings on the home page",
                "Several main headings make the page topic less clear.", "Keep one H1; change the others to H2.")
    else:
        rep.ok("SEO basics", "One clear H1 heading")
    if page.canonical:
        rep.ok("SEO basics", "Canonical tag present")
    else:
        rep.add("SEO basics", "low", "No canonical tag",
                "Google may treat versions of the same page as duplicates.",
                "Add <link rel=\"canonical\"> (most SEO plugins do this automatically).")
    base = f"{urllib.parse.urlparse(final).scheme}://{final_host}"
    time.sleep(POLITE_DELAY)
    robots = fetch(base + "/robots.txt", max_bytes=50_000)
    robots_txt = robots.body.decode("utf-8", "replace") if robots.status == 200 else ""
    if robots.status == 200:
        rep.ok("SEO basics", "robots.txt present")
        if re.search(r"(?im)^user-agent:\s*\*\s*$[\s\S]*?^disallow:\s*/\s*$", robots_txt):
            rep.add("SEO basics", "high", "robots.txt blocks search engines from the whole site",
                    "Google may drop your pages from search results entirely.",
                    "Remove the 'Disallow: /' line (often left on by accident after a redesign).")
    else:
        rep.add("SEO basics", "low", "No robots.txt file",
                "A small file that tells search engines how to crawl your site.",
                "Add a basic robots.txt that points to your sitemap.")
    time.sleep(POLITE_DELAY)
    sm_url = (re.search(r"(?im)^sitemap:\s*(\S+)", robots_txt) or [None, base + "/sitemap.xml"])[1]
    sm = fetch(sm_url, max_bytes=200_000)
    if sm.status != 200:
        time.sleep(POLITE_DELAY)
        sm = fetch(base + "/sitemap_index.xml", max_bytes=200_000)
    if sm.status == 200 and b"<" in sm.body[:500]:
        rep.ok("SEO basics", "XML sitemap found")
    else:
        rep.add("SEO basics", "medium", "No XML sitemap found",
                "A sitemap helps Google find all your service and team pages.",
                "Generate one (Yoast/RankMath on WordPress, built in on Wix/Squarespace) and submit it in Google Search Console.")
    if "noindex" in page.meta.get("robots", "").lower():
        rep.add("SEO basics", "high", "Home page is set to 'noindex'",
                "This tells Google NOT to show your home page in search results.",
                "Remove the noindex setting (WordPress: Settings > Reading > 'Discourage search engines').")

    # --- Mobile
    vp = page.meta.get("viewport", "")
    if "width=device-width" in vp.replace(" ", ""):
        rep.ok("Mobile", "Mobile viewport set")
    else:
        rep.add("Mobile", "high", "Site isn't set up for phones (no mobile viewport)",
                "On phones the page shows tiny, zoomed-out text, and most new patients search on phones.",
                "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> and use a responsive theme.")
    if "user-scalable=no" in vp.replace(" ", "") or "maximum-scale=1" in vp.replace(" ", ""):
        rep.add("Mobile", "low", "Zooming is disabled on phones",
                "Patients with poor eyesight can't enlarge text.", "Remove 'user-scalable=no' / 'maximum-scale=1'.")

    # --- Accessibility basics
    no_alt = [i for i in page.imgs if "alt" not in i]
    if page.imgs and no_alt:
        sev = "medium" if len(no_alt) > 3 else "low"
        rep.add("Accessibility", sev, f"{len(no_alt)} of {len(page.imgs)} images have no alt text",
                "Screen readers can't describe these images, and Google can't understand them.",
                "Add a short description to each image (e.g. 'Dr. Lee with a patient').")
    else:
        rep.ok("Accessibility", "Images have alt text")
    unlabeled = [i for i in page.inputs if not i.get("_wrapped") and i.get("id") not in page.label_for
                 and not i.get("aria-label") and not i.get("aria-labelledby") and not i.get("title")]
    if unlabeled:
        rep.add("Accessibility", "low", f"{len(unlabeled)} form fields have no label",
                "Screen-reader users can't tell what to type. Placeholder text alone disappears when typing.",
                "Add a visible <label> to each field.")
    elif page.inputs:
        rep.ok("Accessibility", "Form fields are labelled")
    if not re.search(r"<html[^>]*\blang=", lower_html):
        rep.add("Accessibility", "low", "Page language not declared",
                "Screen readers may read the page with the wrong pronunciation.", "Add lang=\"en\" to the <html> tag.")

    # --- Patient actions
    hrefs = [l.strip() for l in page.links]
    if any(l.lower().startswith("tel:") for l in hrefs):
        rep.ok("Patient actions", "Tap-to-call phone link")
    else:
        has_phone = re.search(r"\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b", text)
        rep.add("Patient actions", "high", "Phone number isn't tap-to-call" if has_phone else "No phone number link found",
                "Mobile visitors have to copy your number by hand, so some of them won't call.",
                "Wrap the number in a link: <a href=\"tel:+15551234567\">(555) 123-4567</a>, ideally in the header.")
    booking = [l for l, t in page.link_texts if any(k in (l + " " + t).lower() for k in BOOKING_HINTS)]
    booking += [s for s in page.iframes if any(k in s.lower() for k in BOOKING_HINTS)]
    if booking:
        rep.ok("Patient actions", "Online booking / appointment link")
    else:
        rep.add("Patient actions", "high", "No online booking or appointment-request link on the home page",
                "Many patients prefer to book outside office hours. Without a clear button, they choose a practice that has one.",
                "Add a prominent 'Book an Appointment' button in the header linking to your booking tool or request form.")
    contact = page.forms > 0 or any("contact" in l.lower() for l in hrefs)
    if contact:
        rep.ok("Patient actions", "Contact form or contact page")
    else:
        rep.add("Patient actions", "medium", "No contact form or contact page link",
                "Some patients want to ask a question before calling.", "Add a simple contact form or a 'Contact' link in the menu.")
    years = [int(y) for y in re.findall(r"(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})", text + lower_html, re.I)]
    this_year = dt.date.today().year
    if years and max(years) < this_year - 1:
        rep.add("Patient actions", "low", f"Copyright year is out of date ({max(years)})",
                "An old year makes the site look unmaintained, and patients may wonder if the practice is still open.",
                "Update the footer, or make it update automatically.")
    elif years:
        rep.ok("Patient actions", "Copyright year current")
    if any(l.lower().startswith("mailto:") for l in hrefs) or "@" in text:
        pass

    # --- Local SEO
    ld = " ".join(page.ld_json).lower() + " " + " ".join(page.itemtypes).lower()
    local_types = ("dentist", "localbusiness", "medicalbusiness", "medicalclinic", "physician", "healthandbeautybusiness")
    if any(f'"{t}"' in ld or f"/{t}" in ld for t in local_types):
        rep.ok("Local SEO", "Dentist / LocalBusiness schema")
    else:
        rep.add("Local SEO", "medium", "No Dentist (LocalBusiness) schema found",
                "Google has less structured information about your location, hours and phone for local searches and Maps.",
                "Add Dentist structured data (JSON-LD) with name, address, phone, hours and URL.")
    addr = re.search(r"\b\d{1,6}\s+[A-Za-z0-9.' ]{2,40}\s(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pkwy|parkway|hwy|highway|ct|court|pl|place|suite|ste)\b", text, re.I)
    if addr or "postaladdress" in ld or "streetaddress" in ld:
        rep.ok("Local SEO", "Address visible")
    else:
        rep.add("Local SEO", "medium", "No street address found on the home page",
                "Patients want to know you're nearby, and Google matches your site to your Maps listing using the address.",
                "Show your full address in the footer, written exactly as on your Google Business Profile.")
    if any("google.com/maps" in s or "maps.google" in s for s in page.iframes) or "maps.googleapis" in lower_html:
        rep.ok("Local SEO", "Embedded map")
    else:
        rep.add("Local SEO", "low", "No embedded map",
                "A map helps new patients find you and see how close you are.",
                "Embed your Google Maps location on the home or contact page.")

    # --- Broken links (same-site + key external, sampled)
    seen, checked, broken = set(), 0, []
    for l in hrefs:
        if not l or l.startswith(("#", "tel:", "mailto:", "javascript:", "sms:")):
            continue
        absu = urllib.parse.urljoin(final, l).split("#")[0]
        if absu in seen or not absu.startswith("http"):
            continue
        seen.add(absu)
        if checked >= MAX_LINKS:
            break
        time.sleep(POLITE_DELAY)
        r = fetch(absu, method="HEAD")
        if r.status in (405, 403, 0):  # some servers reject HEAD
            r = fetch(absu, max_bytes=1)
        if r.status == 0:  # timeout / bot-blocking: don't report as broken
            continue
        checked += 1
        if r.status >= 400:
            broken.append((absu, r.status or "no response"))
    rep.metrics["links_checked"] = checked
    if broken:
        rep.add("Broken links", "medium" if len(broken) > 2 else "low",
                f"{len(broken)} broken link(s) found",
                "Clicking a dead link gives patients an error page and makes the site feel neglected.",
                "Fix or remove: " + "; ".join(f"{u} ({s})" for u, s in broken[:8]))
    else:
        rep.ok("Broken links", f"No broken links in {checked} checked")

    return rep


# ---------------------------------------------------------------- rendering
CSS = """
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a2433;max-width:860px;margin:0 auto;padding:32px 20px;line-height:1.55}
h1{margin:0 0 4px;font-size:1.8rem}h2{margin:32px 0 10px;font-size:1.3rem;border-bottom:2px solid #0b6e6e;padding-bottom:4px}
.muted{color:#4a5568}.top{display:flex;gap:28px;align-items:center;flex-wrap:wrap;margin:24px 0}
.dial{width:140px;height:140px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.dial div{width:108px;height:108px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.dial strong{font-size:2.2rem;line-height:1}.bars{list-style:none;padding:0;margin:0;flex:1;min-width:260px}
.bars li{display:grid;grid-template-columns:130px 1fr 40px;gap:10px;align-items:center;margin:6px 0}
.bar{height:10px;background:#e5e7eb;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:#0b6e6e}
.f{border-left:4px solid #991b1b;background:#fdf2f2;padding:10px 14px;margin:12px 0;border-radius:0 6px 6px 0;page-break-inside:avoid}
.f.medium{border-color:#92400e;background:#fdf6ec}.f.low{border-color:#4a5568;background:#f3f4f6}
.tag{font-size:.72rem;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:99px;color:#fff;background:#991b1b;margin-right:6px}
.tag.medium{background:#92400e}.tag.low{background:#4a5568}.cat{font-size:.8rem;color:#4a5568}
.ok li{margin:3px 0}.cta{background:#e6f4f4;border:1px solid #0b6e6e;border-radius:10px;padding:16px 20px;margin-top:28px}
footer{margin-top:40px;font-size:.82rem;color:#4a5568}@media print{.cta a{color:#000}}
"""


def render_html(rep: Report, snapshot: bool) -> str:
    e = html.escape
    score = rep.overall()
    g = grade(score)
    col = "#166534" if score >= 80 else "#92400e" if score >= 60 else "#991b1b"
    cats = rep.category_scores()
    findings = rep.sorted_findings()
    shown = findings[:3] if snapshot else findings
    out = [f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
           f"<title>{'Website Snapshot' if snapshot else 'Website Health Report'}: {e(rep.name)}</title><style>{CSS}</style></head><body>",
           f"<p class='muted' style='margin:0'>Enamel Audits &middot; {'Free Website Snapshot' if snapshot else 'Website Health Report'}</p>",
           f"<h1>{e(rep.name)}</h1><p class='muted'>{e(rep.url)} &middot; checked {e(rep.date)}</p>"]
    if rep.fatal:
        out.append(f"<p><strong>{e(rep.fatal)}</strong></p>")
    out.append(f"<div class='top'><div class='dial' style='background:conic-gradient({col} 0 {score}%,#e5e7eb {score}% 100%)'>"
               f"<div><strong>{score}</strong><span>Grade {g}</span></div></div><ul class='bars'>")
    for c in CATEGORIES:
        out.append(f"<li><span>{e(c)}</span><span class='bar'><i style='width:{cats[c]}%'></i></span><span>{cats[c]}</span></li>")
    out.append("</ul></div>")
    n_high = sum(1 for f in findings if f.severity == "high")
    out.append(f"<p>We found <strong>{len(findings)} issue{'s' if len(findings) != 1 else ''}</strong>"
               f"{f', including {n_high} high priority' if n_high else ''}. "
               f"{'Here are your top 3:' if snapshot else 'They are listed below in the order we suggest fixing them.'}</p>")
    out.append(f"<h2>{'Top issues' if snapshot else 'Fix list (highest priority first)'}</h2>")
    if not shown:
        out.append("<p>No issues found. Nice work.</p>")
    for i, f in enumerate(shown, 1):
        out.append(f"<div class='f {f.severity}'><span class='tag {f.severity}'>{f.severity}</span>"
                   f"<span class='cat'>{e(f.category)}</span><br><strong>{i}. {e(f.title)}</strong><br>"
                   f"<em>Why it matters:</em> {e(f.why)}<br><em>Fix:</em> {e(f.fix)}</div>")
    if snapshot:
        rest = len(findings) - len(shown)
        out.append("<div class='cta'><strong>Want the full picture?</strong> "
                   f"{f'There are {rest} more issue(s) in your full report, ' if rest > 0 else 'The full report includes '}"
                   "each with a plain-English explanation and a fix your web person can follow. "
                   "<a href='https://buy.stripe.com/9B64gz5Pc8lC15E2A65kk00'>Get the full report for $97</a>. "
                   "If it doesn't find at least 3 actionable improvements, you get a full refund.</div>")
    else:
        out.append("<h2>What's already working</h2><ul class='ok'>")
        out += [f"<li>&#10003; <strong>{e(c)}:</strong> {e(t)}</li>" for c, t in rep.passed]
        out.append("</ul>")
        m = rep.metrics
        out.append(f"<h2>Measurements</h2><p class='muted'>Server response: {m.get('response_seconds','?')}s &middot; "
                   f"Home page HTML: {m.get('html_kb','?')} KB &middot; SSL days left: {m.get('ssl_days_left','n/a')} &middot; "
                   f"Links checked: {m.get('links_checked',0)}</p>")
        out.append("<div class='cta'><strong>Want us to fix these for you?</strong> Our Fix-It Package starts at $497, "
                   "with a fixed quote before any work starts. Or keep an eye on your score with Monitoring at $29/month. "
                   "Reply to this email or write to <a href='mailto:kchantarohit@gmail.com'>kchantarohit@gmail.com</a>.</div>")
    out.append("<footer>Automated review of publicly available pages, for informational purposes. Accessibility checks "
               "cover basics only and are not legal advice. No specific search ranking or patient results are guaranteed.</footer></body></html>")
    return "\n".join(out)


def outreach_email(rep: Report) -> str:
    """A short, honest cold email to send alongside a free snapshot."""
    top = rep.sorted_findings()[:3]
    bullets = "\n".join(f"  - {f.title}" for f in top) or "  - (no issues found)"
    return (f"Subject: Quick website check for {rep.name}: {rep.overall()}/100\n\n"
            f"Hi,\n\nI ran a free health check on {rep.url} and it scored {rep.overall()}/100 (grade {grade(rep.overall())}).\n"
            f"The top things I'd fix first:\n{bullets}\n\n"
            "I've attached the free snapshot with a plain-English fix for each one, so your web person can act on it.\n"
            "If you want the full list ($97, refunded if it finds fewer than 3 improvements): "
            "https://buy.stripe.com/9B64gz5Pc8lC15E2A65kk00\n\n"
            "No worries if not. Hope it's useful either way.\n\n"
            "Enamel Audits\n"
            "136 Sukhumvit St, Pattaya, Chonburi 20150 Thailand\n"
            "Reply 'no thanks' and I won't email again.\n")


# ---------------------------------------------------------------- cli
def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "site"


def run_one(url, name, args, outdir: Path):
    rep = audit(url, name)
    base = slug(rep.name)
    kind = "snapshot" if args.snapshot else "report"
    path = outdir / f"{base}-{kind}-{rep.date}.html"
    path.write_text(render_html(rep, args.snapshot), encoding="utf-8")
    if args.json:
        jd = asdict(rep) | {"score": rep.overall(), "grade": grade(rep.overall()), "categories": rep.category_scores()}
        (outdir / f"{base}-{rep.date}.json").write_text(json.dumps(jd, indent=2), encoding="utf-8")
    if args.snapshot:
        (outdir / f"{base}-email.txt").write_text(outreach_email(rep), encoding="utf-8")
    print(f"{rep.overall():>3} {grade(rep.overall())}  {len(rep.findings):>2} issues  {rep.url}  -> {path}")
    return rep


def main(argv=None):
    p = argparse.ArgumentParser(description="Enamel Audits website health report")
    p.add_argument("url", nargs="?")
    p.add_argument("--name", default="", help="Practice name for the report header")
    p.add_argument("--snapshot", action="store_true", help="Free snapshot: score + top 3 issues + outreach email")
    p.add_argument("--batch", help="File with one URL per line (optionally 'URL, Practice Name')")
    p.add_argument("--json", action="store_true", help="Also write JSON (for monthly monitoring comparisons)")
    p.add_argument("--out", default="reports", help="Output directory (default: reports/)")
    args = p.parse_args(argv)
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    if args.batch:
        rows = []
        for line in Path(args.batch).read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                u, _, n = line.partition(",")
                rows.append((u.strip(), n.strip()))
        summary = []
        for u, n in rows:
            try:
                r = run_one(u, n, args, outdir)
                summary.append((r.overall(), u, n))
            except Exception as ex:  # keep the batch going
                print(f"ERR {u}: {ex}", file=sys.stderr)
        summary.sort()
        (outdir / "batch-summary.csv").write_text(
            "score,url,name\n" + "\n".join(f"{s},{u},{n}" for s, u, n in summary), encoding="utf-8")
        print(f"\nWorst-scoring sites first (best prospects): {outdir/'batch-summary.csv'}")
    elif args.url:
        run_one(args.url, args.name, args, outdir)
    else:
        p.error("give a URL or --batch FILE")


if __name__ == "__main__":
    main()
