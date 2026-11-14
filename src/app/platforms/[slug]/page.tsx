import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditForm } from "@/components/AuditForm";
import { CHECK_BY_ID, guideSlug } from "@/lib/audit/catalog";
import { SITE } from "@/lib/site";
import { PLATFORMS, PLATFORM_BY_SLUG } from "@/content/platforms";

export const dynamicParams = false;

export function generateStaticParams() {
  return PLATFORMS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/platforms/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = PLATFORM_BY_SLUG[slug];
  if (!p) return {};
  return { title: p.headline, description: p.description, alternates: { canonical: `/platforms/${p.slug}` }, openGraph: { title: p.headline, description: p.description } };
}

export default async function PlatformPage(props: PageProps<"/platforms/[slug]">) {
  const { slug } = await props.params;
  const p = PLATFORM_BY_SLUG[slug];
  if (!p) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: p.headline,
    description: p.description,
    step: p.fixes.map((f, i) => ({ "@type": "HowToStep", position: i + 1, name: CHECK_BY_ID[f.check].label, text: f.how })),
  };
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_22rem]">
      <article className="prose-guide">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <p className="text-sm font-semibold uppercase tracking-wide text-brand"><Link href="/platforms">Platforms</Link> · {p.name}</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{p.headline}</h1>
        <p className="mt-4 text-lg">{p.intro}</p>

        <h2>What {p.name} {p.managed ? "usually handles" : "handles"} for you</h2>
        <ul>{p.handledForYou.map((h) => <li key={h}>{h}</li>)}</ul>

        <h2>{p.managed ? "What to check, and what to ask for" : `How to fix the common issues on ${p.name}`}</h2>
        {p.fixes.map((f) => {
          const c = CHECK_BY_ID[f.check];
          return (
            <section key={f.check} className="card my-4 p-5">
              <h3 className="text-lg font-bold">{c.label}</h3>
              <p className="mt-1 text-sm text-muted">{c.why}</p>
              <p className="mt-2">{f.how}</p>
              <p className="mt-2 text-sm"><Link className="underline" href={`/guides/${guideSlug(c.id)}`}>Full guide: {c.guideTitle}</Link></p>
            </section>
          );
        })}

        <h2>Also watch out for</h2>
        <ul>{p.watchOut.map((w) => <li key={w}>{w}</li>)}</ul>

        {p.vendorEmail && (
          <>
            <h2>Email to send your provider</h2>
            <p>Run the free check, then copy this and fill in the top issues from your report:</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0f1c2a] p-4 text-sm text-slate-100">{p.vendorEmail}</pre>
          </>
        )}

        <h2>Other platforms</h2>
        <ul>
          {PLATFORMS.filter((x) => x.slug !== p.slug).map((x) => (
            <li key={x.slug}><Link className="underline" href={`/platforms/${x.slug}`}>{x.headline}</Link></li>
          ))}
        </ul>
      </article>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <AuditForm compact source={`platform-${p.slug}`} />
        <p className="mt-4 text-sm text-muted">
          The check tells you which of these apply to your {p.name} site. The full report (${SITE.reportPrice}) lists every issue with step-by-step fixes and comes with a money-back guarantee.
        </p>
      </aside>
    </div>
  );
}
