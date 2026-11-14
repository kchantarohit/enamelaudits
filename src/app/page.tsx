import Link from "next/link";
import { AuditForm } from "@/components/AuditForm";
import { CategoryBars, ScoreDial } from "@/components/ScoreDial";
import { CHECKS } from "@/lib/audit/catalog";
import { CATEGORY_META, CATEGORY_ORDER, SITE } from "@/lib/site";

const FAQ = [
  {
    q: "Do you need access to my website?",
    a: "No. We only look at public pages, the same ones any patient can see. No logins, passwords or plugins.",
  },
  {
    q: "What do I get for free, and what's in the $97 report?",
    a: "Free: your overall score, category scores, and your top issues. The full report unlocks every issue we found, ranked by priority, with plain-English impact, step-by-step fixes and code your web person can use, plus 2 free re-scans within 30 days to confirm the fixes.",
  },
  {
    q: "How fast do I get the full report?",
    a: "Instantly. It unlocks on the same page as soon as payment completes, and you can print it or save it as a PDF.",
  },
  {
    q: "What if the report doesn't help?",
    a: "If your full report doesn't find at least 3 actionable improvements, email us within 14 days for a full refund.",
  },
  {
    q: "Does this make my site ADA or HIPAA compliant?",
    a: "No. We check accessibility basics like alt text and form labels, a useful starting point but not a legal audit or legal advice. For compliance questions, talk to a qualified professional.",
  },
  {
    q: "Will fixing these issues get me more patients?",
    a: "We can't promise specific results, because many things affect how patients choose a practice. We show you clear, fixable problems that make your site slower, harder to find, or harder to book from.",
  },
  {
    q: "Can you fix the problems for me?",
    a: `Yes. Our Fix-It service starts at $${SITE.fixItFrom} and is quoted after we've seen your report, so you know the price before any work starts. You're also welcome to hand the report to your own web person.`,
  },
  {
    q: "How does monthly monitoring work?",
    a: `For $${SITE.monitoringMonthly}/month we re-run the full check every month and send you the updated report with your score change. Useful after site updates, plugin changes or a new web vendor. Cancel anytime.`,
  },
];

const SAMPLE = [
  { label: "Speed", score: 55 },
  { label: "Security", score: 80 },
  { label: "Google basics", score: 62 },
  { label: "Mobile", score: 100 },
  { label: "Patient actions", score: 50 },
  { label: "Local SEO", score: 45 },
];

export default function Home() {
  const counts = CATEGORY_ORDER.map((c) => ({ c, n: CHECKS.filter((k) => k.category === c).length }));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      email: SITE.contactEmail,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="bg-gradient-to-br from-brand-50 via-white to-white">
        <div id="audit" className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-8 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div>
            <p className="inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-dark">For dental practices</p>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">Is your website quietly turning new patients away?</h1>
            <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
              Get an instant, plain-English health check of your practice website: speed, security, Google basics, mobile, accessibility,
              and whether patients can easily <strong className="text-ink">call or book</strong>. Every issue comes with a fix your web person can follow.
            </p>
            <ul className="mt-6 hidden gap-2 text-sm font-medium sm:grid sm:grid-cols-2">
              <li>✅ {CHECKS.length} checks across 8 areas</li>
              <li>✅ Results in about 30 seconds</li>
              <li>✅ No login or website access needed</li>
              <li>✅ Money-back guarantee on the full report</li>
            </ul>
          </div>
          <AuditForm />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-extrabold">Most practice websites don&apos;t break. They slowly leak patients.</h2>
        <p className="mt-3 max-w-3xl text-lg text-muted">
          Your site probably looks fine on the office computer. A new patient searching on their phone at 9pm may see something very different.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["⏳", "Slow pages", "When a site takes too long to appear on a phone, people tap back and choose the next practice in the results."],
            ["📞", "Hard to call or book", "A phone number that isn't tappable, or a booking link buried three clicks deep, adds friction right when someone is ready to act."],
            ["🔎", "Missing Google basics", "Missing titles, descriptions, sitemaps or business details make it harder for Google to show your practice for local searches."],
          ].map(([icon, h, p]) => (
            <div key={h} className="card p-6">
              <div className="text-3xl" aria-hidden>{icon}</div>
              <h3 className="mt-3 text-lg font-bold">{h}</h3>
              <p className="mt-2 text-muted">{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="checks" className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold">What the check covers</h2>
          <p className="mt-3 max-w-3xl text-lg text-muted">{CHECKS.length} automated checks of your public pages, each translated into plain English with a clear fix.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {counts.map(({ c, n }) => (
              <div key={c} className="card p-5">
                <h3 className="font-bold">{CATEGORY_META[c].label}</h3>
                <p className="mt-1 text-sm text-muted">{CATEGORY_META[c].blurb}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {CHECKS.filter((k) => k.category === c).slice(0, 4).map((k) => <li key={k.id}>• {k.label}</li>)}
                  {n > 4 && <li className="text-muted">+ {n - 4} more</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="sample" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-extrabold">What your report looks like</h2>
        <p className="mt-3 max-w-3xl text-lg text-muted">One score, a breakdown by area, then a prioritized fix list you can hand straight to your web person.</p>
        <div className="card mt-8 p-6" role="figure" aria-label="Sample report">
          <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
            <div className="mx-auto"><ScoreDial score={68} grade="D" /></div>
            <div>
              <h3 className="mb-3 font-bold">Sample: Example Family Dental</h3>
              <CategoryBars scores={SAMPLE} />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {[
              ["High", "bg-bad", "Phone number isn't tap-to-call.", "Mobile visitors have to copy it by hand. Fix: wrap the number in a tel: link."],
              ["Medium", "bg-warn", "No meta description on the home page.", "Google picks random text for your listing. Fix: add a 1–2 sentence description."],
              ["Medium", "bg-warn", "No Dentist structured data.", "Google has less information about your location and hours. Fix: add Dentist schema."],
            ].map(([sev, bg, t, d]) => (
              <div key={t} className="rounded-lg border border-line p-3 text-sm">
                <span className={`mr-2 rounded-full ${bg} px-2 py-0.5 text-xs font-bold uppercase text-white`}>{sev}</span>
                <strong>{t}</strong> <span className="text-muted">{d}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">Illustrative example with made-up data, not a real practice.</p>
        </div>
      </section>

      <section id="pricing" className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold">Simple pricing</h2>
          <p className="mt-3 text-lg text-muted">See your score free. Pay only when you want every fix.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div className="card flex flex-col p-6">
              <h3 className="text-lg font-bold">Free check</h3>
              <p className="my-2 text-4xl font-extrabold">$0</p>
              <ul className="flex-1 space-y-1 text-sm"><li>✓ Overall score and grade</li><li>✓ Scores for all 8 areas</li><li>✓ Your top issues</li></ul>
              <Link href="#audit" className="btn btn-secondary mt-5">Run free check</Link>
            </div>
            <div className="card flex flex-col border-2 border-brand p-6 shadow-lg">
              <span className="self-start rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-white">Most popular</span>
              <h3 className="mt-2 text-lg font-bold">Full Health Report</h3>
              <p className="my-2 text-4xl font-extrabold">${SITE.reportPrice} <span className="text-base font-semibold text-muted">one-time</span></p>
              <ul className="flex-1 space-y-1 text-sm">
                <li>✓ Every issue, ranked by priority</li>
                <li>✓ Step-by-step fixes + code</li>
                <li>✓ Plain-English impact for each</li>
                <li>✓ Unlocks instantly · print to PDF</li>
                <li>✓ 2 free re-scans within 30 days</li>
                <li>✓ Money-back guarantee</li>
              </ul>
              <Link href="#audit" className="btn btn-primary mt-5">Start with a free check</Link>
            </div>
            <div className="card flex flex-col p-6">
              <h3 className="text-lg font-bold">Monitoring</h3>
              <p className="my-2 text-4xl font-extrabold">${SITE.monitoringMonthly} <span className="text-base font-semibold text-muted">/month</span></p>
              <p className="-mt-1 mb-2 text-xs text-muted">or ${SITE.monitoringAnnual}/year (2 months free)</p>
              <ul className="flex-1 space-y-1 text-sm"><li>✓ Full report included</li><li>✓ Fresh report every month</li><li>✓ Score change tracking</li><li>✓ Cancel anytime</li></ul>
              <Link href="#audit" className="btn btn-secondary mt-5">Start with a free check</Link>
            </div>
            <div className="card flex flex-col p-6">
              <h3 className="text-lg font-bold">Fix-It service</h3>
              <p className="my-2 text-4xl font-extrabold"><span className="text-base font-semibold text-muted">from</span> ${SITE.fixItFrom}</p>
              <ul className="flex-1 space-y-1 text-sm"><li>✓ We fix the issues for you</li><li>✓ Fixed quote before work starts</li><li>✓ Re-check report when done</li></ul>
              <a href={`mailto:${SITE.contactEmail}?subject=Fix-It%20quote`} className="btn btn-secondary mt-5">Ask for a quote</a>
            </div>
          </div>
          <p className="mt-6 rounded-lg bg-brand-50 p-4 text-sm">
            <strong>Our guarantee:</strong> if your full report doesn&apos;t find at least 3 actionable improvements, email us within 14 days and we&apos;ll refund you in full.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-extrabold">How it works</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["Enter your website", "No passwords, plugins or access to your site. Just the address."],
            ["Get your score instantly", "See your overall grade, scores by area, and your most urgent issues in about 30 seconds."],
            ["Unlock every fix", `For $${SITE.reportPrice}, get the full prioritized fix list right away. Print it or forward the link to your web person.`],
          ].map(([h, p], i) => (
            <li key={h} className="card p-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand font-extrabold text-white">{i + 1}</span>
              <h3 className="mt-3 text-lg font-bold">{h}</h3>
              <p className="mt-2 text-muted">{p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="faq" className="border-y border-line bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-3xl font-extrabold">Frequently asked questions</h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card p-4">
                <summary className="cursor-pointer font-bold">{f.q}</summary>
                <p className="mt-2 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold">See your score in 30 seconds</h2>
          <p className="mt-3 text-lg text-muted">It&apos;s free, needs no login, and you&apos;ll know exactly what to fix first.</p>
          <p className="mt-4 text-sm text-muted">
            Prefer to read first? Browse our <Link className="underline" href="/guides">dental website guides</Link> or try the free{" "}
            <Link className="underline" href="/tools/dentist-schema-generator">Dentist schema generator</Link>.
          </p>
        </div>
        <AuditForm compact source="footer" />
      </section>
    </>
  );
}
