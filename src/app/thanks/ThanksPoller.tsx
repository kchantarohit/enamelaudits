"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ThanksPoller({ sessionId, audit }: { sessionId: string; audit: string }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setTimedOut(true);
      return;
    }
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      try {
        const qs = new URLSearchParams({ session_id: sessionId, ...(audit ? { audit } : {}) });
        const res = await fetch(`/api/session-status?${qs}`, { cache: "no-store" });
        const data = await res.json();
        if (data.status === "ready" && data.auditId) {
          router.replace(`/report/${data.auditId}`);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - started > 90_000) setTimedOut(true);
      else setTimeout(tick, 2500);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [sessionId, audit, router]);

  if (timedOut) {
    return (
      <p className="mt-4 text-muted">
        Your payment went through, but your report is taking longer than usual to prepare. Please keep this page&apos;s address and email{" "}
        <a className="underline" href={`mailto:kchantarohit@gmail.com?subject=Report%20for%20session%20${encodeURIComponent(sessionId)}`}>kchantarohit@gmail.com</a>. We&apos;ll send your report link right away.
      </p>
    );
  }
  return (
    <div className="mt-6 flex flex-col items-center gap-3 text-muted" aria-live="polite">
      <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden />
      <p>Unlocking your full report… this usually takes a few seconds.</p>
    </div>
  );
}
