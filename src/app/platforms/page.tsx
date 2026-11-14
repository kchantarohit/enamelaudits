import type { Metadata } from "next";
import Link from "next/link";
import { PLATFORMS } from "@/content/platforms";

export const metadata: Metadata = {
  title: "Dental Website Audits by Platform: WordPress, Wix, Squarespace & More",
  description: "How to fix common dental website problems on WordPress, Wix, Squarespace, GoDaddy, Duda and managed dental website providers.",
  alternates: { canonical: "/platforms" },
};

export default function PlatformsIndex() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">Fixes by website platform</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted">
        The same problem is fixed differently on every platform. Our free check detects what your site is built with; pick yours below for platform-specific steps.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {PLATFORMS.map((p) => (
          <li key={p.slug} className="card p-5">
            <Link href={`/platforms/${p.slug}`} className="text-lg font-bold text-brand-dark hover:underline">{p.headline}</Link>
            <p className="mt-1 text-sm text-muted">{p.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
