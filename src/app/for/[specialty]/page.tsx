import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditForm } from "@/components/AuditForm";
import { CHECKS, CHECK_BY_ID, guideSlug } from "@/lib/audit/catalog";
import { SITE } from "@/lib/site";
import { SPECIALTIES, SPECIALTY_BY_SLUG } from "@/content/specialties";

export const dynamicParams = false;

export function generateStaticParams() {
  return SPECIALTIES.map((s) => ({ specialty: s.slug }));
}

export async function generateMetadata(props: PageProps<"/for/[specialty]">): Promise<Metadata> {
  const { specialty } = await props.params;
  const s = SPECIALTY_BY_SLUG[specialty];
  if (!s) return {};
  const description = `Free instant website audit for ${s.plural.toLowerCase()}. ${CHECKS.length} checks for speed, security, Google basics, mobile and booking. See your score in 30 seconds.`;
  return { title: s.headline, description, alternates: { canonical: `/for/${s.slug}` }, openGraph: { title: s.headline, description } };
}

export default async function SpecialtyPage(props: PageProps<"/for/[specialty]">) {
  const { specialty } = await props.params;
  const s = SPECIALTY_BY_SLUG[specialty];
  if (!s) notFound();
  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-dark">For {s.plural.toLowerCase()}</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight">{s.headline}</h1>
            <p className="mt-4 text-lg text-muted">{s.intro}</p>
          </div>
          <AuditForm source={`for-${s.slug}`} />
        </div>
      </section>
      <div className="prose-guide mx-auto max-w-3xl px-4 py-12">
        <h2>The moment that matters</h2>
        <p>{s.patientMoment}</p>
        <h2>What we check first for a {s.singular}</h2>
        <ul>
          {s.priorities.map((p) => (
            <li key={p.check}>
              <Link className="font-semibold underline" href={`/guides/${guideSlug(p.check)}`}>{CHECK_BY_ID[p.check].label}</Link>: {p.reason}
            </li>
          ))}
        </ul>
        <h2>Questions to ask about your own site</h2>
        <ul>{s.extra.map((e) => <li key={e}>{e}</li>)}</ul>
        <h2>What you get</h2>
        <p>
          The free check gives you a score, a breakdown across 8 areas and your top issues in about 30 seconds. The full report (${SITE.reportPrice}, one-time)
          lists every issue in priority order with plain-English impact and step-by-step fixes your web person can follow, unlocks instantly, and includes two
          free re-scans to confirm fixes. If it doesn&apos;t find at least 3 actionable improvements, you get a full refund.
        </p>
        <p className="mt-6"><Link href="#main" className="btn btn-primary">Run the free check</Link></p>
        <h2>Other practice types</h2>
        <ul>
          {SPECIALTIES.filter((x) => x.slug !== s.slug).map((x) => (
            <li key={x.slug}><Link className="underline" href={`/for/${x.slug}`}>{x.headline}</Link></li>
          ))}
        </ul>
      </div>
    </>
  );
}
