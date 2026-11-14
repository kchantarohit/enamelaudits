"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-secondary !py-2 text-sm">
      Print / save as PDF
    </button>
  );
}

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary !py-2 text-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href.split("?")[0]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? "Link copied ✓" : "Copy link for your web person"}
    </button>
  );
}

export function RescanButton({ id, remaining }: { id: string; remaining: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (remaining <= 0) return null;
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className="btn btn-primary !py-2 text-sm"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/rescan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.id) router.push(`/report/${data.id}`);
          else {
            setError(data.error || "Re-scan failed.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Re-scanning… (about 30s)" : `Re-scan after fixes (${remaining} left)`}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-bad">{error}</span>}
    </span>
  );
}
