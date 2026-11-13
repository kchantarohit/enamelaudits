import type { Metadata } from "next";
import Link from "next/link";
import { CHECKS, guideSlug } from "@/lib/audit/catalog";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/site";

export const metadata: Metadata = {
  title: "Dental Website Guides: Fix Speed, SEO, Security & Booking Issues",
  description: "Plain-English guides to the most common dental practice website problems, with step-by-step fixes and copy-paste code.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndex() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">Dental website guides</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted">
        Every problem our audit checks for, explained in plain English with how to check it yourself and how to fix it. Or{" "}
        <Link href="/#audit" className="underline">run a free check</Link> to see which ones affect your site.
      </p>
      {CATEGORY_ORDER.map((cat) => (
        <section key={cat} className="mt-10">
          <h2 className="text-2xl font-extrabold">{CATEGORY_META[cat].label}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {CHECKS.filter((c) => c.category === cat).map((c) => (
              <li key={c.id} className="card p-4">
                <Link href={`/guides/${guideSlug(c.id)}`} className="font-bold text-brand-dark hover:underline">{c.guideTitle}</Link>
                <p className="mt-1 text-sm text-muted">{c.guideDescription}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
