// Shared helpers for the outreach scripts. Node 20+, no dependencies except nodemailer (for sending).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(ROOT, "out");
export const STATE = path.join(ROOT, "state");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(STATE, { recursive: true });

/** Load outreach/.env (KEY=VALUE lines) into process.env without overriding existing vars. */
export function loadEnv() {
  const f = path.join(ROOT, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.error(`Missing ${name}. Set it in outreach/.env (see outreach/.env.example).`);
    process.exit(1);
  }
  return v;
}

export function args() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    out[k] = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (minMs, maxMs) => minMs + Math.floor(Math.random() * (maxMs - minMs));
export const today = () => new Date().toISOString().slice(0, 10);

// ---- minimal RFC 4180 CSV ------------------------------------------------
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export function toCsv(records, columns) {
  const cols = columns || [...new Set(records.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...records.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export function readCsv(file) {
  return fs.existsSync(file) ? parseCsv(fs.readFileSync(file, "utf8")) : [];
}

export function appendCsv(file, record, columns) {
  const exists = fs.existsSync(file);
  const line = toCsv([record], columns).split("\n");
  fs.appendFileSync(file, exists ? line[1] + "\n" : line.join("\n"));
}

export function domainOf(url) {
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// ---- suppression list (unsubscribes, bounces, "not interested") --------
const SUPPRESS = path.join(STATE, "suppression.txt");
export function suppressed() {
  if (!fs.existsSync(SUPPRESS)) return new Set();
  return new Set(fs.readFileSync(SUPPRESS, "utf8").split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean));
}
export function suppress(value) {
  fs.appendFileSync(SUPPRESS, value.trim().toLowerCase() + "\n");
}

// ---- Enamel Audits API ---------------------------------------------------
export async function auditViaApi(url, business, campaign) {
  const base = env("SITE_URL", "https://enamelaudits.vercel.app").replace(/\/$/, "");
  const res = await fetch(`${base}/api/outreach/audit`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("OUTREACH_TOKEN")}` },
    body: JSON.stringify({ url, business, campaign }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `audit failed (${res.status})`);
  return data;
}

export async function statsViaApi(days = 30) {
  const base = env("SITE_URL", "https://enamelaudits.vercel.app").replace(/\/$/, "");
  const res = await fetch(`${base}/api/outreach/stats?days=${days}`, { headers: { authorization: `Bearer ${env("OUTREACH_TOKEN")}` } });
  if (!res.ok) throw new Error(`stats failed (${res.status})`);
  return res.json();
}
