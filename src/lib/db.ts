import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditResult } from "./audit/types";

export interface AuditRow {
  id: string;
  created_at: string;
  url: string;
  final_url: string | null;
  domain: string;
  email: string | null;
  business_name: string | null;
  score: number;
  grade: string;
  result: AuditResult;
  source: string;
  parent_id: string | null;
  paid: boolean;
  paid_at: string | null;
  stripe_session_id: string | null;
  amount_cents: number | null;
  customer_email: string | null;
  rescans_used: number;
}

export interface SubscriptionRow {
  id: string;
  email: string;
  website: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  next_run_at: string;
  last_audit_id: string | null;
  last_score: number | null;
}

let client: SupabaseClient | null = null;

function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_KEY are not configured");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function secret() {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("APP_SECRET is not configured");
  return s;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, { p_secret: secret(), ...args });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export interface NewAudit {
  url: string;
  result: AuditResult;
  email?: string | null;
  business_name?: string | null;
  source?: string;
  ip_hash?: string | null;
  parent_id?: string | null;
  paid?: boolean;
  stripe_session_id?: string | null;
  amount_cents?: number | null;
  customer_email?: string | null;
}

export function createAudit(a: NewAudit) {
  return rpc<string>("ea_create_audit", {
    p_data: {
      url: a.url,
      final_url: a.result.meta.finalUrl,
      domain: a.result.meta.domain,
      email: a.email || "",
      business_name: a.business_name || "",
      score: a.result.score,
      grade: a.result.grade,
      result: a.result,
      source: a.source || "web",
      ip_hash: a.ip_hash || null,
      parent_id: a.parent_id || "",
      paid: !!a.paid,
      stripe_session_id: a.stripe_session_id || "",
      amount_cents: a.amount_cents == null ? "" : String(a.amount_cents),
      customer_email: a.customer_email || "",
    },
  });
}

export const getAudit = (id: string) => rpc<AuditRow | null>("ea_get_audit", { p_id: id });
export const countRecentAudits = (ipHash: string, minutes: number) =>
  rpc<number>("ea_count_recent_audits", { p_ip_hash: ipHash, p_minutes: minutes });
export const markPaid = (id: string, sessionId: string, amountCents: number | null, email: string | null) =>
  rpc<AuditRow | null>("ea_mark_paid", { p_id: id, p_session_id: sessionId, p_amount_cents: amountCents, p_email: email || "" });
export const findAuditBySession = (sessionId: string) => rpc<string | null>("ea_find_by_session", { p_session_id: sessionId });
export const useRescan = (id: string, max: number) => rpc<boolean>("ea_use_rescan", { p_id: id, p_max: max });
export const recordEvent = (eventId: string, type: string) => rpc<boolean>("ea_record_event", { p_event_id: eventId, p_type: type });
export const forgetEvent = (eventId: string) => rpc<null>("ea_forget_event", { p_event_id: eventId });
export const upsertSubscription = (data: Partial<SubscriptionRow>) => rpc<string>("ea_upsert_subscription", { p_data: data });
export const setSubscriptionStatus = (stripeSubscriptionId: string, status: string) =>
  rpc<null>("ea_set_subscription_status", { p_stripe_subscription_id: stripeSubscriptionId, p_status: status });
export const dueSubscriptions = (limit: number) => rpc<SubscriptionRow[]>("ea_due_subscriptions", { p_limit: limit });
export const subscriptionRan = (id: string, auditId: string, score: number) =>
  rpc<null>("ea_subscription_ran", { p_id: id, p_audit_id: auditId, p_score: score });
export const stats = (days: number) => rpc<Record<string, unknown>>("ea_stats", { p_days: days });

export function isUuid(s: string | null | undefined): s is string {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

// ---- Cold outreach queue (migration 0003) ------------------------------------
export interface OutreachContact {
  id: string;
  email: string;
  domain: string;
  website: string;
  name: string | null;
  first_name: string | null;
  city: string | null;
  status: string;
  attempts: number;
}

export interface OutreachLead {
  email: string;
  domain: string;
  website?: string;
  name?: string;
  first_name?: string;
  city?: string;
  source?: string;
}

export const outreachEnqueue = (rows: OutreachLead[]) =>
  rpc<{ inserted: number; skipped: number }>("ea_outreach_enqueue", { p_rows: rows });
export const outreachPeek = (limit: number) => rpc<OutreachContact[]>("ea_outreach_peek", { p_limit: limit });
export const outreachNext = (limit: number, dailyCap: number) =>
  rpc<{ contacts: OutreachContact[]; sent_24h: number; remaining_24h: number }>("ea_outreach_next", { p_limit: limit, p_daily_cap: dailyCap });
export const outreachResult = (id: string, status: "sent" | "skipped" | "failed", data: Record<string, unknown>) =>
  rpc<null>("ea_outreach_result", { p_id: id, p_status: status, p_data: data });
export const outreachSuppress = (value: string, reason: string) => rpc<null>("ea_outreach_suppress", { p_value: value, p_reason: reason });
export const outreachStats = () => rpc<Record<string, unknown>>("ea_outreach_stats", {});
