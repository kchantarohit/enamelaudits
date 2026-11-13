import type { Category } from "../site";

export type Severity = "high" | "medium" | "low";
export type Status = "pass" | "warn" | "fail" | "info";

export interface CheckDef {
  id: string;
  category: Category;
  severity: Severity;
  /** Neutral label, e.g. "Tap-to-call phone link" */
  label: string;
  /** Issue phrasing shown when the check fails, e.g. "Phone number isn't tap-to-call" */
  issue: string;
  /** Why this matters to the practice, in plain English */
  why: string;
  /** How the practice can check this themselves */
  howToCheck: string;
  /** Concrete fix steps for the web person */
  fix: string[];
  /** Optional code sample */
  code?: string;
  /** SEO guide title */
  guideTitle: string;
  /** SEO meta description for the guide page */
  guideDescription: string;
}

export interface CheckResult {
  id: string;
  status: Status;
  /** Evidence-based summary for this specific site */
  detail: string;
  evidence?: string[];
  /** Severity override (e.g. a warn that is less severe than the default) */
  severity?: Severity;
}

export interface AuditMeta {
  inputUrl: string;
  finalUrl: string;
  domain: string;
  statusCode: number;
  ttfbMs: number;
  totalMs: number;
  htmlBytes: number;
  pageTitle: string | null;
  platform: string | null;
  redirects: string[];
  durationMs: number;
  auditedAt: string;
  version: number;
}

export interface AuditResult {
  meta: AuditMeta;
  checks: CheckResult[];
  categoryScores: Partial<Record<Category, number>>;
  score: number;
  grade: string;
}
