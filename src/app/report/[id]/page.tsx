import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IssueCard } from "@/components/IssueCard";
import { CopyLinkButton, PrintButton, RescanButton } from "@/components/ReportActions";
import { CategoryBars, ScoreDial } from "@/components/ScoreDial";
import { CHECK_BY_ID } from "@/lib/audit/catalog";
import { rankIssues, severityOf } from "@/lib/audit/score";
import { getAudit, isUuid } from "@/lib/db";
import { CATEGORY_META, CATEGORY_ORDER, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your website health report", robots: { index: false, follow: false } };

const FREE_ISSUES = 3;

export default async function ReportPage(props: PageProps<"/report/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!isUuid(id)) notFound();
  const audit = await getAudit(id);
  if (!audit) notFound();

  const { result } = audit;
  const issues = rankIssues(result.checks);
  const passed = result.checks.filter((c) => c.status === "pass");
  const sevCount = (s: string) => issues.filter((c) => severityOf(c) === s).length;
  const catScores = CATEGORY_ORDER.filter((c) => result.categoryScores[c] !== undefined).map((c) => ({ label: CATEGORY_META[c].label, score: result.categoryScores[c]! }));
  const paid = audit.paid;
  const freeIssues = issues.slice(0, FREE_ISSUES);
  const locked = issues.slice(FREE_ISSUES);
  const lockedByCat = CATEGORY_ORDER.map((c) => ({ c, n: locked.filter((i) => CHECK_BY_ID[i.id].category === c).length })).filter((x) => x.n);
  const date = new Date(audit.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const unlockHref = `/api/checkout?audit=${audit.id}&plan=report`;
  const ageDays = (Date.now() - new Date(audit.paid_at || audit.created_at).getTime()) / 86_400_000;
  const rescansLeft = paid && audit.source !== "rescan" && ageDays <= 30 ? Math.max(0, SITE.rescanLimit - audit.rescans_used) : 0;
  const fixItMail = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`Fix-It quote for ${audit.domain}`)}&body=${encodeURIComponent(`Hi, please quote fixing the issues in this report: ${SITE.url}/report/${audit.id}`)}`;

  return (
    <div className={`mx-auto max-w-5xl px-4 py-10 ${audit.paid ? "" : "pb-28 sm:pb-10"}`}>
      {sp.canceled && !paid && (
        <p className="no-print mb-6 rounded-lg bg-amber-50 p-3 text-sm text-warn">Checkout was canceled. Your free results are still here whenever you&apos;re ready.</p>
      )}
      {sp.checkout_error && (
        <p className="no-print mb-6 rounded-lg bg-red-50 p-3 text-sm text-bad">We couldn&apos;t start checkout. Please try again, or email {SITE.contactEmail}.</p>
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">{paid ? "Full website health report" : "Free website check"}</p>
          <h1 className="text-3xl font-extrabold break-all">{audit.business_name || audit.domain}</h1>
          <p className="text-sm text-muted">
            {result.meta.finalUrl} · checked {date}
            {result.meta.platform ? ` · built with ${result.meta.platform}` : ""}
          </p>
        </div>
        {paid && (
          <div className="no-print flex flex-wrap gap-2">
            <PrintButton />
            <CopyLinkButton />
            <RescanButton id={audit.id} remaining={rescansLeft} />
          </div>
        )}
      </header>

      <section className="card mt-6 grid items-center gap-8 p-6 md:grid-cols-[auto_1fr]" aria-label="Score summary">
        <div className="mx-auto text-center">
          <ScoreDial score={result.score} grade={result.grade} />
        </div>
        <div>
          <p className="mb-4 text-lg">
            We found <strong>{issues.length} issue{issues.length === 1 ? "" : "s"}</strong>
            {issues.length > 0 && <> ({sevCount("high")} high, {sevCount("medium")} medium, {sevCount("low")} low priority)</>} and{" "}
            <strong>{passed.length} checks passed</strong>.
          </p>
          <CategoryBars scores={catScores} />
        </div>
      </section>

      {paid ? (
        <>
          <section className="mt-10">
            <h2 className="text-2xl font-extrabold">Your prioritized fix list</h2>
            <p className="mt-1 text-muted">Start at the top. High-priority items have the biggest effect on patients and on Google.</p>
            <div className="mt-5 space-y-4">
              {issues.map((c, i) => <IssueCard key={c.id} c={c} index={i} showFix />)}
              {!issues.length && <p className="card p-5">No issues found. Impressive! Consider monitoring to keep it that way.</p>}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-extrabold">What&apos;s working ({passed.length})</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {CATEGORY_ORDER.map((cat) => {
                const items = passed.filter((c) => CHECK_BY_ID[c.id].category === cat);
                if (!items.length) return null;
                return (
                  <div key={cat} className="card p-4">
                    <h3 className="font-bold">{CATEGORY_META[cat].label}</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {items.map((c) => (
                        <li key={c.id}><span className="font-bold text-good">✓</span> {CHECK_BY_ID[c.id].label}: <span className="text-muted">{c.detail}</span></li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="no-print mt-10 grid gap-5 md:grid-cols-2">
            {audit.source !== "monitoring" && (
              <div className="card p-6">
                <h2 className="text-xl font-extrabold">Keep it healthy: monthly monitoring</h2>
                <p className="mt-2 text-muted">Websites drift: plugin updates, a new vendor, an expired certificate. We&apos;ll re-run this full check every month and email you the score change.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a className="btn btn-primary" href={`/api/checkout?audit=${audit.id}&plan=monthly`}>${SITE.monitoringMonthly}/month</a>
                  <a className="btn btn-secondary" href={`/api/checkout?audit=${audit.id}&plan=annual`}>${SITE.monitoringAnnual}/year</a>
                </div>
              </div>
            )}
            <div className="card p-6">
              <h2 className="text-xl font-extrabold">Want us to fix it for you?</h2>
              <p className="mt-2 text-muted">Send us this report and we&apos;ll reply with a fixed quote (from ${SITE.fixItFrom}) before any work starts, then re-check your site when we&apos;re done.</p>
              <a className="btn btn-accent mt-4" href={fixItMail}>Get a Fix-It quote</a>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-2xl font-extrabold">{freeIssues.length ? `Your top ${freeIssues.length} issue${freeIssues.length === 1 ? "" : "s"}` : "No issues found"}</h2>
            <div className="mt-5 space-y-4">
              {freeIssues.map((c, i) => <IssueCard key={c.id} c={c} index={i} showFix={i === 0} />)}
            </div>
          </section>

          {locked.length > 0 && (
            <section className="mt-8" aria-label="Locked issues">
              <h2 className="text-2xl font-extrabold">+ {locked.length} more issue{locked.length === 1 ? "" : "s"} found</h2>
              <ul className="mt-4 space-y-2">
                {lockedByCat.map(({ c, n }) => (
                  <li key={c} className="card flex items-center justify-between gap-3 p-4">
                    <span><span aria-hidden>🔒</span> <strong>{CATEGORY_META[c].label}</strong> <span className="blur-line text-muted" aria-hidden>hidden issue details are in the full report</span></span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">{n} issue{n === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section id="unlock" className="no-print mt-8 rounded-2xl border-2 border-brand bg-white p-6 shadow-xl sm:p-8">
            <div className="grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-center">
              <div>
                <h2 className="text-2xl font-extrabold">Unlock your full report: ${SITE.reportPrice}</h2>
                <ul className="mt-3 space-y-1">
                  <li>✓ All {issues.length} issues, ranked by priority</li>
                  <li>✓ Step-by-step fixes and code for your web person</li>
                  <li>✓ The evidence we found for each issue</li>
                  <li>✓ Everything that&apos;s working, so you don&apos;t pay to fix it</li>
                  <li>✓ {SITE.rescanLimit} free re-scans within 30 days to confirm fixes</li>
                </ul>
                <p className="mt-3 text-sm text-muted">One-time payment. Unlocks instantly on this page. If the report doesn&apos;t find at least 3 actionable improvements, you get a full refund.</p>
              </div>
              <div className="flex flex-col gap-3">
                <a href={unlockHref} className="btn btn-primary py-4 text-lg">Unlock full report: ${SITE.reportPrice}</a>
                <a href={`/api/checkout?audit=${audit.id}&plan=monthly`} className="btn btn-secondary text-sm">Or monitoring ${SITE.monitoringMonthly}/mo (includes full report)</a>
                <p className="text-center text-xs text-muted">Secure checkout by Stripe</p>
              </div>
            </div>
          </section>
        </>
      )}

      <p className="mt-10 text-xs text-muted">
        This report is an automated review of publicly available pages on {date}, provided for informational purposes. Accessibility checks cover basics only and are not legal advice. No specific search ranking or patient results are guaranteed.
        {" "}Questions? <a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </p>
      <p className="no-print mt-4 text-sm"><Link className="underline" href="/#audit">Check another website</Link></p>
      {!paid && issues.length > 0 && (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
          <a href={unlockHref} className="btn btn-primary w-full">Unlock all {issues.length} fixes: ${SITE.reportPrice}</a>
        </div>
      )}
    </div>
  );
}
