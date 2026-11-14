import Link from "next/link";
import { CHECK_BY_ID, guideSlug } from "@/lib/audit/catalog";
import { severityOf } from "@/lib/audit/score";
import type { CheckResult } from "@/lib/audit/types";
import { CATEGORY_META } from "@/lib/site";

const SEV_STYLE = {
  high: "bg-bad text-white",
  medium: "bg-warn text-white",
  low: "bg-slate-600 text-white",
} as const;

export function SeverityTag({ c }: { c: CheckResult }) {
  const sev = severityOf(c);
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${SEV_STYLE[sev]}`}>{sev}</span>;
}

export function IssueCard({ c, index, showFix }: { c: CheckResult; index?: number; showFix: boolean }) {
  const def = CHECK_BY_ID[c.id];
  const sev = severityOf(c);
  const border = sev === "high" ? "border-l-bad" : sev === "medium" ? "border-l-warn" : "border-l-slate-500";
  return (
    <article className={`card border-l-4 ${border} p-5`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {index !== undefined && <span className="font-bold text-ink">#{index + 1}</span>}
        <SeverityTag c={c} />
        <span>{CATEGORY_META[def.category].label}</span>
        {c.status === "warn" && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-warn">Needs attention</span>}
      </div>
      <h3 className="mt-2 text-lg font-bold">{def.issue}</h3>
      <p className="mt-1 text-sm font-medium text-ink">What we found: {c.detail}</p>
      {c.evidence && c.evidence.length > 0 && showFix && (
        <ul className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-700">
          {c.evidence.map((e, i) => <li key={i} className="break-all">{e}</li>)}
        </ul>
      )}
      <p className="mt-3 text-sm text-muted"><strong className="text-ink">Why it matters:</strong> {def.why}</p>
      {showFix ? (
        <div className="mt-3 rounded-lg bg-brand-50 p-4">
          <p className="text-sm font-bold text-brand-dark">How to fix it</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {def.fix.map((f, i) => <li key={i}>{f}</li>)}
          </ol>
          {def.code && <pre className="mt-3 overflow-x-auto rounded-md bg-[#0f1c2a] p-3 text-xs text-slate-100"><code>{def.code}</code></pre>}
          <p className="mt-2 text-xs"><Link className="underline" href={`/guides/${guideSlug(def.id)}`}>Full guide: {def.guideTitle}</Link></p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-brand/40 bg-white p-4 text-sm">
          <p className="font-bold text-brand-dark">🔒 Step-by-step fix included in the full report</p>
          <p className="blur-line mt-1 text-muted" aria-hidden>Open your site settings and update the configuration so that this issue is resolved for every page and every visitor.</p>
        </div>
      )}
    </article>
  );
}
