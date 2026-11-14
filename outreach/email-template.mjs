// The cold email, personalized from a real audit of the clinic's own website.
// Manual versions, follow-ups and reply scripts live in outreach/templates/cold-email.md.

/** Lead with the patient impact when the clinic's #1 issue is one of these. */
const HOOKS = {
  noindex: {
    subject: (p, d) => `${d} may be hidden from Google`,
    open: (d) => `I ran a quick check on ${d} and it's telling Google not to list it (a "noindex" setting, often left on by accident after a redesign). If that's not intentional, your site may be missing from search results entirely. It's a one-setting fix.`,
  },
  robots_txt: {
    subject: (p, d) => `${d} may be blocked from Google`,
    open: (d) => `I ran a quick check on ${d} and its robots.txt file blocks search engines from the whole site. If that's not intentional, you may be missing from Google results. It's a one-line fix.`,
  },
  https: {
    subject: (p, d) => `${d} shows "Not secure"`,
    open: (d) => `Heads up: ${d} shows a "Not secure" warning in the browser, right next to your practice name. For a healthcare practice that warning alone can make a new patient leave. The fix is usually a free certificate and one redirect.`,
  },
  ssl_certificate: {
    subject: (p, d) => `${d}: certificate problem`,
    open: (d) => `Heads up: our check found a problem with the security certificate on ${d}. When a certificate is invalid or expires, browsers show a full-page warning instead of your site.`,
  },
  tel_link: {
    subject: (p) => `${p}: patients can't tap your number`,
    open: (d) => `I was looking at ${d} the way a patient would on a phone and noticed your phone number isn't tappable. Mobile visitors have to copy it by hand, which is exactly when people give up and call the next practice. It's a two-minute fix.`,
  },
  online_booking: {
    subject: (p, d) => `Booking from ${d} after hours`,
    open: (d) => `I tried to book a visit on ${d} the way a new patient would at 9pm, and couldn't find a way to book or request an appointment online. A lot of people search for a dentist after hours, so that's usually worth fixing first.`,
  },
  server_response: {
    subject: (p, d) => `${d} loads slowly on phones`,
    open: (d, top) => `${d} was slow to start loading in our check (${String(top.detail).replace(/\.$/, "")}). On a phone with mobile data that usually means a few seconds of blank screen, which is when people tap back to the search results.`,
  },
  viewport: {
    subject: (p, d) => `${d} on phones`,
    open: (d) => `I opened ${d} on a phone and it isn't set up for mobile screens, so patients see a shrunken desktop page they have to pinch and zoom. Most patients find a dentist on their phone, and Google ranks mobile-unfriendly sites lower.`,
  },
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @param {object} p
 * @param {{first_name?: string, name?: string}} p.lead
 * @param {{domain: string, score: number, grade: string, issueCount: number, reportUrl: string, topIssues: {id: string, issue: string, detail: string}[]}} p.audit
 * @param {{name: string, address: string}} p.sender
 * @param {string} [p.unsubscribeUrl]
 */
export function renderEmail({ lead, audit, sender, unsubscribeUrl }) {
  const first = (lead.first_name || "").trim() || "there";
  const practice = (lead.name || "").trim() || audit.domain;
  const [top, second] = audit.topIssues || [];
  const fixes = plural(audit.issueCount, "fix", "fixes");
  const hook = top && HOOKS[top.id];

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
    sender.name,
    `Enamel Audits · ${sender.address}`,
    "",
    `You're receiving this because ${audit.domain} is a public dental practice website.` +
      (unsubscribeUrl ? ` Unsubscribe: ${unsubscribeUrl}` : ` Reply "no thanks" and you won't hear from me again.`),
  ];
  return { subject, text: lines.join("\n") };
}
