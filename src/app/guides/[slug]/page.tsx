import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditForm } from "@/components/AuditForm";
import { CHECKS, checkFromSlug, guideSlug } from "@/lib/audit/catalog";
import { CATEGORY_META, SITE } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return CHECKS.map((c) => ({ slug: guideSlug(c.id) }));
}

export async function generateMetadata(props: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const c = checkFromSlug(slug);
  if (!c) return {};
  return {
    title: c.guideTitle,
    description: c.guideDescription,
    alternates: { canonical: `/guides/${slug}` },
    openGraph: { title: c.guideTitle, description: c.guideDescription, type: "article" },
  };
}

export default async function GuidePage(props: PageProps<"/guides/[slug]">) {
  const { slug } = await props.params;
  const c = checkFromSlug(slug);
  if (!c) notFound();
  const related = CHECKS.filter((x) => x.category === c.category && x.id !== c.id).slice(0, 4);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: c.guideTitle,
    description: c.guideDescription,
    step: c.fix.map((f, i) => ({ "@type": "HowToStep", position: i + 1, text: f })),
  };
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_22rem]">
      <article className="prose-guide">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          <Link href="/guides">Guides</Link> · {CATEGORY_META[c.category].label}
        </p>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight">{c.guideTitle}</h1>
        <p className="mt-4 text-lg">{c.guideDescription}</p>

        <h2>Why it matters for your practice</h2>
        <p>{c.why}</p>

        <h2>How to check your own website</h2>
        <p>{c.howToCheck}</p>
        <p>
          Or let us check it for you: our <Link href="/#audit" className="underline">free website check</Link> tests this and {CHECKS.length - 1} other
          things in about 30 seconds.
        </p>

        <h2>How to fix it</h2>
        <ol>{c.fix.map((f, i) => <li key={i}>{f}</li>)}</ol>
        {c.code && (
          <>
            <h2>Example code</h2>
            <pre className="overflow-x-auto rounded-lg bg-[#0f1c2a] p-4 text-sm text-slate-100"><code>{c.code}</code></pre>
            <p className="text-sm">Not comfortable editing code? Forward this page to whoever manages your website.</p>
          </>
        )}

        <h2>Priority</h2>
        <p>
          We rate this a <strong>{c.severity}</strong>-priority issue in our audits.{" "}
          {c.severity === "high"
            ? "Fix it first: it directly affects whether patients can find, trust, or contact you."
            : c.severity === "medium"
              ? "Worth fixing soon: it chips away at your visibility or patient experience."
              : "A quick win: small on its own, but these add up, and most take minutes to fix."}
        </p>

        {related.length > 0 && (
          <>
            <h2>Related guides</h2>
            <ul>
              {related.map((r) => (
                <li key={r.id}><Link className="underline" href={`/guides/${guideSlug(r.id)}`}>{r.guideTitle}</Link></li>
              ))}
            </ul>
          </>
        )}
      </article>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <AuditForm compact source={`guide-${slug}`} />
        <p className="mt-4 text-sm text-muted">
          Want every issue on your site with fixes like this one? The full report is ${SITE.reportPrice}, unlocks instantly, and comes with a money-back guarantee.
        </p>
      </aside>
    </div>
  );
}
