import { CATEGORY_META, CATEGORY_ORDER, type Category } from "../site";
import { CHECK_BY_ID } from "./catalog";
import type { CheckResult, Severity } from "./types";

const SEV_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const STATUS_VALUE = { pass: 1, warn: 0.5, fail: 0 } as const;

export function severityOf(c: CheckResult): Severity {
  return c.severity || CHECK_BY_ID[c.id]?.severity || "low";
}

export function gradeFor(score: number) {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

export function scoreChecks(checks: CheckResult[]) {
  const categoryScores: Partial<Record<Category, number>> = {};
  let num = 0;
  let den = 0;
  for (const cat of CATEGORY_ORDER) {
    const rel = checks.filter((c) => CHECK_BY_ID[c.id]?.category === cat && c.status !== "info");
    if (!rel.length) continue;
    let n = 0;
    let d = 0;
    for (const c of rel) {
      const w = SEV_WEIGHT[severityOf(c)];
      d += w;
      n += w * STATUS_VALUE[c.status as keyof typeof STATUS_VALUE];
    }
    const s = Math.round((100 * n) / d);
    categoryScores[cat] = s;
    num += CATEGORY_META[cat].weight * s;
    den += CATEGORY_META[cat].weight;
  }
  const score = den ? Math.round(num / den) : 0;
  return { categoryScores, score, grade: gradeFor(score) };
}

const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Failing/warning checks, most important first. */
export function rankIssues(checks: CheckResult[]): CheckResult[] {
  return checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((a, b) => {
      const s = (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1);
      if (s) return s;
      const v = SEV_RANK[severityOf(a)] - SEV_RANK[severityOf(b)];
      if (v) return v;
      return CATEGORY_ORDER.indexOf(CHECK_BY_ID[a.id].category) - CATEGORY_ORDER.indexOf(CHECK_BY_ID[b.id].category);
    });
}
