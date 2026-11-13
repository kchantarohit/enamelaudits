"use client";

export default function ReportError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-extrabold">We couldn&apos;t load this report</h1>
      <p className="mt-3 text-muted">This is usually temporary. Please try again in a moment. If you paid and still can&apos;t see your report, email kchantarohit@gmail.com and we&apos;ll sort it out right away.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">Try again</button>
    </div>
  );
}
