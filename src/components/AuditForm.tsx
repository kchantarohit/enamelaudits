"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

const STEPS = [
  "Loading your home page like a patient's phone would…",
  "Checking HTTPS, certificate and security headers…",
  "Reviewing Google basics: title, description, sitemap…",
  "Looking for tap-to-call, booking and contact options…",
  "Checking local SEO signals and structured data…",
  "Testing links and image sizes…",
  "Scoring and prioritizing what to fix first…",
];

export function AuditForm({ compact = false, source }: { compact?: boolean; source?: string }) {
  const router = useRouter();
  const uid = useId();
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setStep(0);
    try {
      const ref = new URLSearchParams(window.location.search).get("ref") || source || undefined;
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, email, ref }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error || "Something went wrong. Please try again.");
      router.push(`/report/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={`card p-5 shadow-lg sm:p-6 ${compact ? "" : "shadow-brand/10"}`} aria-describedby={`${uid}-help`}>
      <h2 className="text-xl font-extrabold">Free website check</h2>
      <p id={`${uid}-help`} className="mt-1 text-sm text-muted">Your score and top 3 issues in about 30 seconds. No login needed.</p>
      <label htmlFor={`${uid}-url`} className="mt-4 block text-sm font-semibold">Practice website</label>
      <input
        id={`${uid}-url`}
        name="url"
        type="text"
        inputMode="url"
        autoComplete="url"
        required
        placeholder="yourpractice.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
        className="mt-1 w-full rounded-lg border border-slate-400 px-3 py-3 text-base"
      />
      <label htmlFor={`${uid}-email`} className="mt-3 block text-sm font-semibold">
        Email <span className="font-normal text-muted">(optional, we&apos;ll send you the link)</span>
      </label>
      <input
        id={`${uid}-email`}
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@yourpractice.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
        className="mt-1 w-full rounded-lg border border-slate-400 px-3 py-3 text-base"
      />
      <button type="submit" className="btn btn-primary mt-4 w-full text-lg" disabled={busy}>
        {busy ? "Checking your site…" : "Check my website free"}
      </button>
      <div aria-live="polite" className="mt-3 min-h-6 text-sm">
        {busy && (
          <p className="flex items-center gap-2 text-brand-dark">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
            {STEPS[step]}
          </p>
        )}
        {error && <p className="font-semibold text-bad" role="alert">{error}</p>}
      </div>
      <p className="mt-1 text-xs text-muted">We only look at public pages, the same ones any patient sees. No spam, ever.</p>
    </form>
  );
}
