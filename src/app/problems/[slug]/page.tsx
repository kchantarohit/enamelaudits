import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditForm } from "@/components/AuditForm";
import { CHECK_BY_ID, guideSlug } from "@/lib/audit/catalog";
import { SITE } from "@/lib/site";
import { PROBLEMS, PROBLEM_BY_SLUG } from "@/content/problems";

export const dynamicParams = false;

export function generateStaticParams() {
  return PROBLEMS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/problems/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = PROBLEM_BY_SLUG[slug];
  if (!p) return {};
  return { title: p.title, description: p.description, alternates: { canonical: `/problems/${p.slug}` }, openGraph: { title: p.title, description: p.description, type: "article" } };
}

export default async function ProblemPage(props: PageProps<"/problems/[slug]">) {
  const { slug } = await props.params;
  const p = PROBLEM_BY_SLUG[slug];
  if (!p) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const related = PROBLEMS.filter((x) => x.slug !== p.slug).slice(0, 5);
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_22rem]">
      <article className="prose-guide">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <p className="text-sm font-semibold uppercase tracking-wide text-brand"><Link href="/problems">Common problems</Link></p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{p.title}</h1>
        <p className="mt-4 text-lg">{p.intro}</p>

        <h2>The usual causes</h2>
        <ol>
          {p.causes.map((c) => (
            <li key={c.check}>
              <Link className="font-semibold underline" href={`/guides/${guideSlug(c.check)}`}>{CHECK_BY_ID[c.check].label}</Link>: {c.explain}
            </li>
          ))}
        </ol>

        <h2>How to check your own site</h2>
        <ol>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>

        <h2>When to get help</h2>
        <p>{p.whenToGetHelp}</p>

        <h2>Questions</h2>
        {p.faq.map((f) => (
          <div key={f.q} className="mt-3">
            <h3 className="font-bold">{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}

        <h2>Related problems</h2>
        <ul>{related.map((r) => <li key={r.slug}><Link className="underline" href={`/problems/${r.slug}`}>{r.title}</Link></li>)}</ul>
      </article>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <AuditForm compact source={`problem-${p.slug}`} />
        <p className="mt-4 text-sm text-muted">
          The free check tests every cause on this page in about 30 seconds. The full report (${SITE.reportPrice}) shows exactly how to fix each one.
        </p>
      </aside>
    </div>
  );
}
