import type { Metadata } from "next";
import Link from "next/link";
import { PROBLEMS } from "@/content/problems";

export const metadata: Metadata = {
  title: "Dental Website Problems: Causes and Fixes",
  description: "Not showing on Google, 'Not secure' warnings, slow on phones, few new patients from the website: causes and step-by-step fixes for dental practices.",
  alternates: { canonical: "/problems" },
};

export default function ProblemsIndex() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">Common dental website problems</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted">Start from the symptom. Each page lists the likely causes, how to check them yourself, and how to fix them.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {PROBLEMS.map((p) => (
          <li key={p.slug} className="card p-5">
            <Link href={`/problems/${p.slug}`} className="text-lg font-bold text-brand-dark hover:underline">{p.title}</Link>
            <p className="mt-1 text-sm text-muted">{p.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
