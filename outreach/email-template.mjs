// The cold email, personalized from a real audit of the clinic's own website.
// Manual versions, follow-ups and reply scripts live in outreach/templates/cold-email.md.
//
// Every claim must match what the audit engine actually checked (the HOME PAGE only), because these
// emails go out unattended. So the hooks below say "on your home page" where that is all we know.

/**
 * Patient-impact openers, in priority order. The first one whose condition matches the audit leads the email.
 * `when` gets the issue ({id, status, severity, issue, detail}); default is status === "fail".
 */
const HOOKS = [
  {
    id: "noindex",
    subject: (p, d) => `${d} may be hidden from Google`,
    open: (d) => `I ran a quick check on ${d} and it's telling Google not to list it (a "noindex" setting, often left on by accident after a redesign). If that's not intentional, your site may be missing from search results entirely. It's a one-setting fix.`,
  },
  {
    id: "robots_txt",
    subject: (p, d) => `${d} may be blocked from Google`,
    open: (d) => `I ran a quick check on ${d} and its robots.txt file blocks search engines from the whole site. If that's not intentional, you may be missing from Google results. It's a one-line fix.`,
  },
  {
    id: "ssl_certificate",
    subject: (p, d) => `${d}: certificate problem`,
    open: (d) => `Heads up: our check found a problem with the security certificate on ${d}. When a certificate is invalid or expires, browsers show a full-page warning instead of your site.`,
  },
  {
    id: "https",
    subject: (p, d) => `${d} shows "Not secure"`,
    open: (d) => `Heads up: ${d} doesn't load over a secure https:// connection, so browsers show "Not secure" right next to your practice name. For a healthcare practice that warning alone can make a new patient leave. The fix is usually a free certificate and one redirect.`,
  },
  {
    id: "http_redirect",
    subject: (p, d) => `${d} still loads without https`,
    open: (d) => `I ran ${d} through our dental website checker and noticed the old http:// version of your site still loads on its own instead of switching to the secure https:// version. Anyone who arrives through an old link or bookmark sees "Not secure" next to your practice name. It's usually a one-line redirect.`,
  },
  {
    id: "tel_link",
    subject: (p) => `${p}: your phone number isn't tap-to-call`,
    open: (d) => `I looked at ${d} the way a patient would on a phone and noticed your phone number on the home page isn't set up as a tap-to-call link. Some phones guess and link it anyway, but on many, patients have to copy it by hand, which is often when they call the next practice instead. It's a two-minute fix.`,
  },
  {
    id: "online_booking",
    subject: (p, d) => `${d}: no "Request an appointment" button`,
    open: (d) => `I looked at ${d} the way a new patient would and couldn't find a "Book online" or "Request an appointment" button on the home page. Lots of people look for a dentist after hours, when they can't call. If your request form lives on another page, a clear button on the home page that links to it is usually enough.`,
  },
  {
    id: "viewport",
    subject: (p, d) => `${d} on phones`,
    open: (d) => `I opened ${d} on a phone and its home page has no mobile viewport setting, so phones show a shrunken desktop page that patients have to pinch and zoom. Most patients find a dentist on their phone, and Google ranks mobile-unfriendly sites lower.`,
  },
  {
    id: "zoom_enabled",
    subject: (p) => `${p}: patients can't zoom in on phones`,
    open: (d) => `I looked at ${d} on a phone and noticed the site tells browsers to block pinch-to-zoom. Many phones follow that, so patients who need bigger text can't enlarge the page. It's a one-line change in the page header.`,
  },
  {
    id: "server_response",
    when: (i) => i.status === "fail" || i.status === "warn",
    subject: (p, d) => `${d} is slow to start loading`,
    open: (d, top) => `${d} was slow to start loading in our check (${String(top.detail).replace(/\.$/, "")}). On a phone with mobile data that means a blank screen for a moment, which is when people tap back to the search results.`,
  },
];

/** Issues worth mentioning to a practice owner (patient-facing, Google visibility, or accessibility). */
const RELEVANT = new Set([
  "noindex", "robots_txt", "ssl_certificate", "https", "http_redirect", "tel_link", "online_booking", "viewport",
  "zoom_enabled", "server_response", "mixed_content", "broken_links", "title", "meta_description", "h1",
  "local_schema", "sitemap", "img_alt", "address_visible", "new_patients", "contact_form", "render_blocking", "image_weight",
]);
const SEV = { high: 0, medium: 1, low: 2 };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const issuesOf = (audit) => (Array.isArray(audit.issues) && audit.issues.length ? audit.issues : audit.topIssues || []);

/** Pick the opener and a second issue to mention, most patient-relevant first. */
export function pickIssues(audit) {
  const issues = issuesOf(audit);
  for (const h of HOOKS) {
    const top = issues.find((i) => i.id === h.id && (h.when ? h.when(i) : i.status === "fail"));
    if (top) {
      const second = issues.find((i) => i !== top && RELEVANT.has(i.id) && i.status === "fail" && !(i.id === "viewport"));
      return { hook: h, top, second };
    }
  }
  const relevant = issues
    .filter((i) => RELEVANT.has(i.id) && !(i.id === "viewport" && i.status !== "fail"))
    .sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1) || (SEV[a.severity] ?? 1) - (SEV[b.severity] ?? 1));
  return { hook: null, top: relevant[0] || issues[0], second: relevant[1] };
}

/**
 * Is this clinic worth an unattended cold email? Needs a real, relevant problem, not just missing security headers.
 * @returns {{ok: boolean, reason?: string}}
 */
export function prospectQuality(audit, { maxScore = 89, minIssues = 3 } = {}) {
  if (audit.score > maxScore) return { ok: false, reason: `score ${audit.score} > ${maxScore}` };
  if ((audit.issueCount ?? issuesOf(audit).length) < minIssues) return { ok: false, reason: `fewer than ${minIssues} issues` };
  const strong = issuesOf(audit).filter((i) => RELEVANT.has(i.id) && i.status === "fail" && i.severity !== "low" && i.id !== "img_alt" && i.id !== "render_blocking");
  const hooked = HOOKS.some((h) => issuesOf(audit).some((i) => i.id === h.id && (h.when ? h.when(i) : i.status === "fail")));
  if (!hooked && strong.length < 2) return { ok: false, reason: "no strong patient-facing issue" };
  return { ok: true };
}

const signature = (sender) => `${sender.name}\nEnamel Audits · ${sender.address}`;
const optOut = (unsubscribeUrl) => (unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : `Reply "no thanks" and you won't hear from me again.`);

/**
 * @param {object} p
 * @param {{first_name?: string, name?: string}} p.lead
 * @param {{domain: string, score: number, grade: string, issueCount: number, reportUrl: string, topIssues: object[], issues?: object[]}} p.audit
 * @param {{name: string, address: string}} p.sender
 * @param {string} [p.unsubscribeUrl]
 */
export function renderEmail({ lead, audit, sender, unsubscribeUrl }) {
  const first = (lead.first_name || "").trim() || "there";
  const practice = (lead.name || "").trim() || audit.domain;
  const { hook, top, second } = pickIssues(audit);
  const fixes = plural(audit.issueCount, "fix", "fixes");

  const subject = hook ? hook.subject(practice, audit.domain) : `${practice}: your website scored ${audit.score}/100`;
  const opening = hook
    ? [hook.open(audit.domain, top), "", `Overall, ${audit.domain} scored ${audit.score}/100 (grade ${audit.grade}) and our check found ${fixes}.${second ? ` Another one worth a look: "${second.issue}."` : ""}`]
    : [
        `I ran ${audit.domain} through our dental website checker. It scored ${audit.score}/100 (grade ${audit.grade}) and found ${fixes}${top ? `, starting with "${top.issue}."` : "."}`,
        ...(second ? ["", `It also flagged: "${second.issue}."`] : []),
      ];

  const lines = [
    `Hi ${first},`,
    "",
    ...opening,
    "",
    `Your free report is here (no login or signup): ${audit.reportUrl}`,
    "",
    `It shows your top issues free. If you'd like all ${fixes} with step-by-step instructions for whoever manages your site, you can unlock the full report on that page for $97. It's refunded if it doesn't find at least 3 real improvements.`,
    "",
    "Either way, I hope it's useful.",
    "",
    signature(sender),
    "",
    `You're receiving this because ${audit.domain} is a public dental practice website. ${optOut(unsubscribeUrl)}`,
  ];
  return { subject, text: lines.join("\n") };
}

/** Hand-checked copy stored on the queue row ({{signature}} and {{unsubscribe_line}} are filled in here). */
export function renderCustom({ subject, body, sender, unsubscribeUrl }) {
  let text = String(body).replaceAll("{{signature}}", signature(sender)).replaceAll("{{unsubscribe_line}}", optOut(unsubscribeUrl));
  if (!text.includes("Enamel Audits ·")) text += `\n\n${signature(sender)}`;
  if (!/Unsubscribe:|no thanks/i.test(text)) text += `\n\n${optOut(unsubscribeUrl)}`;
  return { subject: String(subject), text };
}
