import Link from "next/link";
import { SITE } from "@/lib/site";
import { SPECIALTIES } from "@/content/specialties";

export function Footer() {
  return (
    <footer className="no-print mt-16 bg-[#0f1c2a] text-[#d6dde5]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-lg font-extrabold text-white">Enamel Audits<span className="text-amber-500">.</span></p>
          <p className="mt-2 text-sm">{SITE.tagline}. Plain-English reports with a clear fix for every issue.</p>
        </div>
        <div>
          <p className="font-bold text-white">For practices</p>
          <ul className="mt-2 space-y-1 text-sm">
            {SPECIALTIES.slice(0, 6).map((s) => (
              <li key={s.slug}><Link className="hover:text-white" href={`/for/${s.slug}`}>{s.plural}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-bold text-white">Free resources</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link className="hover:text-white" href="/#audit">Free website check</Link></li>
            <li><Link className="hover:text-white" href="/tools/dentist-schema-generator">Dentist schema generator</Link></li>
            <li><Link className="hover:text-white" href="/guides">Dental website guides</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-bold text-white">Company</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link className="hover:text-white" href="/privacy">Privacy</Link></li>
            <li><Link className="hover:text-white" href="/terms">Terms &amp; refunds</Link></li>
            <li><a className="hover:text-white" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></li>
          </ul>
          <p className="mt-3 text-xs text-[#9fb0c0]">{SITE.address}</p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-[#9fb0c0]">
        Reports are automated reviews of publicly available pages, provided for informational purposes. Accessibility checks cover basics only and are not legal advice. No specific search ranking or patient results are guaranteed.
      </p>
    </footer>
  );
}
